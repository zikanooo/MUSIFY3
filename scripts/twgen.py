#!/usr/bin/env python3
"""Generator CSS utilitas statis (subset kompatibel Tailwind v3) untuk Musify.
Memindai semua token di JS/HTML, lalu menghasilkan css/utilities.css (tanpa runtime di browser).
Pemakaian: python3 -I twgen.py <public_dir> <out.css> [unknown.txt]
"""
import re, sys, glob, os

root, out = sys.argv[1], sys.argv[2]
unk_out = sys.argv[3] if len(sys.argv) > 3 else None

# ---------- sumber token ----------
files = glob.glob(os.path.join(root, 'js/**/*.js'), recursive=True) + [os.path.join(root, 'index.html')]
tokens = set()
for f in files:
    s = open(f, encoding='utf8').read()
    for t in re.split(r'[\s"\'`<>=;{}\\|&]+', s):
        t = t.strip('.,:()')  # buang tanda baca di tepi (bukan di dalam [..])
        if t.count('[') != t.count(']') or t.count('(') != t.count(')'):
            t = re.sub(r'^[^\[\w!-]+', '', t)
        if t and len(t) < 70:
            tokens.add(t)

# ---------- skala ----------
SP = {'0': '0px', 'px': '1px'}
for n in [0.5, 1, 1.5, 2, 2.5, 3, 3.5] + list(range(4, 13)) + [14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96]:
    key = ('%g' % n)
    SP[key] = ('%grem' % (n * 0.25)) if n else '0px'
SP['0'] = '0px'

def arb(v):
    return v.replace('_', ' ')

def fr(v):
    m = re.fullmatch(r'(\d+)/(\d+)', v)
    if not m: return None
    p = ('%.6f' % (int(m.group(1)) * 100 / int(m.group(2)))).rstrip('0').rstrip('.')
    return p + '%'

def spacing(v, neg=False, extra=None):
    """nilai ukuran/spasi -> css atau None"""
    r = None
    if extra and v in extra: r = extra[v]
    elif v in SP: r = SP[v]
    elif v.startswith('[') and v.endswith(']'): r = arb(v[1:-1])
    elif fr(v): r = fr(v)
    if r is None: return None
    if neg:
        if r == '0px': return r
        return '-' + r if not r.startswith('calc') else 'calc(%s * -1)' % r
    return r

PAL = {
    'amber': {300: 'fcd34d', 400: 'fbbf24', 500: 'f59e0b', 600: 'd97706'},
    'emerald': {300: '6ee7b7', 400: '34d399', 500: '10b981', 600: '059669'},
    'red': {300: 'fca5a5', 400: 'f87171', 500: 'ef4444', 600: 'dc2626', 700: 'b91c1c'},
    'rose': {300: 'fda4af', 400: 'fb7185', 500: 'f43f5e', 600: 'e11d48'},
    'zinc': {300: 'd4d4d8', 400: 'a1a1aa', 500: '71717a', 800: '27272a', 900: '18181b'},
    'gray': {200: 'e5e7eb', 300: 'd1d5db', 400: '9ca3af', 500: '6b7280', 800: '1f2937'},
    'cyan': {400: '22d3ee', 500: '06b6d4'},
    'indigo': {400: '818cf8', 500: '6366f1'},
    'purple': {400: 'c084fc', 500: 'a855f7'},
    'sky': {400: '38bdf8', 500: '0ea5e9'},
    'blue': {400: '60a5fa', 500: '3b82f6'},
    'green': {400: '4ade80', 500: '22c55e'},
    'orange': {400: 'fb923c', 500: 'f97316'},
    'pink': {400: 'f472b6', 500: 'ec4899'},
    'yellow': {400: 'facc15', 500: 'eab308'},
}

def hex_rgb(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

def color(spec):
    """'white/10', 'amber-400', '[#20222c]/50' -> css color atau None"""
    op = None
    m = re.fullmatch(r'(.+?)/(\[[\d.]+\]|\d+)', spec)
    if m and not spec.startswith('['):
        spec, op = m.group(1), m.group(2)
    elif spec.startswith('[') :
        m = re.fullmatch(r'(\[[^\]]+\])/(\[[\d.]+\]|\d+)', spec)
        if m: spec, op = m.group(1), m.group(2)
    if op is not None:
        op = float(op[1:-1]) if op.startswith('[') else int(op) / 100.0
    base = None
    if spec == 'white': base = (255, 255, 255)
    elif spec == 'black': base = (0, 0, 0)
    elif spec == 'transparent': return 'transparent'
    elif spec == 'current': return 'currentColor'
    elif spec.startswith('[') and spec.endswith(']'):
        v = arb(spec[1:-1])
        if v.startswith('#'): base = hex_rgb(v)
        else: return v if re.match(r'(rgb|hsl|var)', v) else None
    else:
        m = re.fullmatch(r'([a-z]+)-(\d+)', spec)
        if m and m.group(1) in PAL and int(m.group(2)) in PAL[m.group(1)]:
            base = hex_rgb(PAL[m.group(1)][int(m.group(2))])
    if base is None: return None
    if op is None: return 'rgb(%d %d %d)' % base
    return 'rgb(%d %d %d / %s)' % (base + (('%g' % op),))

def color_tw(spec):
    """versi dengan --tw-*-opacity untuk fallback; di sini cukup warna langsung"""
    return color(spec)

# ---------- handler (urutan = peringkat output) ----------
rules = []  # (variant_rank, util_rank, token, selector_builder, decls)
unknown = set()

SIZES = {'xs': ('0.75rem', '1rem'), 'sm': ('0.875rem', '1.25rem'), 'base': ('1rem', '1.5rem'), 'lg': ('1.125rem', '1.75rem'),
         'xl': ('1.25rem', '1.75rem'), '2xl': ('1.5rem', '2rem'), '3xl': ('1.875rem', '2.25rem'), '4xl': ('2.25rem', '2.5rem'),
         '5xl': ('3rem', '1'), '6xl': ('3.75rem', '1')}
WEIGHT = {'thin': 100, 'extralight': 200, 'light': 300, 'normal': 400, 'medium': 500, 'semibold': 600, 'bold': 700, 'extrabold': 800, 'black': 900}
LEAD = {'none': '1', 'tight': '1.25', 'snug': '1.375', 'normal': '1.5', 'relaxed': '1.625', 'loose': '2'}
TRACK = {'tighter': '-0.05em', 'tight': '-0.025em', 'normal': '0em', 'wide': '0.025em', 'wider': '0.05em', 'widest': '0.1em'}
RAD = {'': '0.25rem', 'none': '0px', 'sm': '0.125rem', 'md': '0.375rem', 'lg': '0.5rem', 'xl': '0.75rem', '2xl': '1rem', '3xl': '1.5rem', 'full': '9999px'}
SHADOW = {
    'sm': ('0 1px 2px 0 rgb(0 0 0 / 0.05)', '0 1px 2px 0 var(--tw-shadow-color)'),
    '': ('0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)', '0 1px 3px 0 var(--tw-shadow-color), 0 1px 2px -1px var(--tw-shadow-color)'),
    'md': ('0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', '0 4px 6px -1px var(--tw-shadow-color), 0 2px 4px -2px var(--tw-shadow-color)'),
    # versi ringan: radius blur kecil agar paint murah (dipakai di banyak kartu)
    'lg': ('0 6px 14px -6px rgb(0 0 0 / 0.5)', '0 6px 14px -6px var(--tw-shadow-color)'),
    'xl': ('0 10px 20px -8px rgb(0 0 0 / 0.55)', '0 10px 20px -8px var(--tw-shadow-color)'),
    '2xl': ('0 14px 28px -10px rgb(0 0 0 / 0.6)', '0 14px 28px -10px var(--tw-shadow-color)'),
    'inner': ('inset 0 2px 4px 0 rgb(0 0 0 / 0.05)', 'inset 0 2px 4px 0 var(--tw-shadow-color)'),
    'none': ('0 0 #0000', '0 0 #0000'),
}
BLUR = {'sm': '2px', '': '4px', 'md': '6px', 'lg': '8px', 'xl': '10px', '2xl': '14px', '3xl': '18px', 'none': '0'}  # diperkecil demi performa
MAXW = {'xs': '20rem', 'sm': '24rem', 'md': '28rem', 'lg': '32rem', 'xl': '36rem', '2xl': '42rem', '3xl': '48rem', '4xl': '56rem',
        '5xl': '64rem', '6xl': '72rem', '7xl': '80rem', 'full': '100%', 'none': 'none', 'screen-sm': '640px', 'screen-md': '768px'}
SIZE_EXTRA = {'full': '100%', 'auto': 'auto', 'min': 'min-content', 'max': 'max-content', 'fit': 'fit-content'}
TRANSFORM = ('transform: translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) '
             'skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))')
SHADOW_DECL = 'box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)'

def D(*a): return list(a)

def handle(u):
    """u: utilitas tanpa varian & tanpa '!' -> (rank, [decl, ...] atau (decls, extra_selector_suffix)) atau None"""
    neg = u.startswith('-')
    if neg: u = u[1:]

    simple = {
        'block': D('display:block'), 'inline-block': D('display:inline-block'), 'inline': D('display:inline'),
        'flex': D('display:flex'), 'inline-flex': D('display:inline-flex'), 'grid': D('display:grid'), 'hidden': D('display:none'),
        'contents': D('display:contents'),
        'absolute': D('position:absolute'), 'fixed': D('position:fixed'), 'relative': D('position:relative'), 'sticky': D('position:sticky'),
        'static': D('position:static'),
        'flex-1': D('flex:1 1 0%'), 'flex-auto': D('flex:1 1 auto'), 'flex-none': D('flex:none'),
        'flex-col': D('flex-direction:column'), 'flex-row': D('flex-direction:row'), 'flex-wrap': D('flex-wrap:wrap'),
        'flex-grow': D('flex-grow:1'), 'grow': D('flex-grow:1'), 'flex-shrink-0': D('flex-shrink:0'), 'shrink-0': D('flex-shrink:0'),
        'items-center': D('align-items:center'), 'items-start': D('align-items:flex-start'), 'items-end': D('align-items:flex-end'),
        'items-stretch': D('align-items:stretch'), 'items-baseline': D('align-items:baseline'),
        'justify-center': D('justify-content:center'), 'justify-between': D('justify-content:space-between'),
        'justify-around': D('justify-content:space-around'), 'justify-start': D('justify-content:flex-start'),
        'justify-end': D('justify-content:flex-end'), 'self-center': D('align-self:center'), 'self-start': D('align-self:flex-start'),
        'stretch': None,
        'grid-flow-col': D('grid-auto-flow:column'),
        'overflow-hidden': D('overflow:hidden'), 'overflow-auto': D('overflow:auto'), 'overflow-x-auto': D('overflow-x:auto'),
        'overflow-y-auto': D('overflow-y:auto'), 'overflow-x-hidden': D('overflow-x:hidden'), 'overflow-y-hidden': D('overflow-y:hidden'),
        'object-cover': D('object-fit:cover'), 'object-contain': D('object-fit:contain'),
        'pointer-events-none': D('pointer-events:none'), 'pointer-events-auto': D('pointer-events:auto'),
        'cursor-pointer': D('cursor:pointer'), 'select-none': D('user-select:none'),
        'aspect-square': D('aspect-ratio:1 / 1'), 'aspect-video': D('aspect-ratio:16 / 9'),
        'text-left': D('text-align:left'), 'text-center': D('text-align:center'), 'text-right': D('text-align:right'),
        'uppercase': D('text-transform:uppercase'), 'lowercase': D('text-transform:lowercase'), 'capitalize': D('text-transform:capitalize'),
        'underline': D('text-decoration-line:underline'), 'truncate': D('overflow:hidden', 'text-overflow:ellipsis', 'white-space:nowrap'),
        'whitespace-nowrap': D('white-space:nowrap'), 'whitespace-pre-wrap': D('white-space:pre-wrap'), 'break-words': D('overflow-wrap:break-word'),
        'font-sans': D('font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",Roboto,system-ui,sans-serif'),
        'font-mono': D('font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace'),
        'italic': D('font-style:italic'),
        'mx-auto': D('margin-left:auto', 'margin-right:auto'), 'my-auto': D('margin-top:auto', 'margin-bottom:auto'),
        'ml-auto': D('margin-left:auto'), 'mr-auto': D('margin-right:auto'), 'mt-auto': D('margin-top:auto'),
        'border-dashed': D('border-style:dashed'), 'border-solid': D('border-style:solid'),
        'transform': D(TRANSFORM), 'filter': None,
        'transition': D('transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter',
                        'transition-timing-function:cubic-bezier(0.4,0,0.2,1)', 'transition-duration:150ms'),
        'transition-all': D('transition-property:all', 'transition-timing-function:cubic-bezier(0.4,0,0.2,1)', 'transition-duration:150ms'),
        'transition-colors': D('transition-property:color,background-color,border-color,text-decoration-color,fill,stroke',
                               'transition-timing-function:cubic-bezier(0.4,0,0.2,1)', 'transition-duration:150ms'),
        'transition-opacity': D('transition-property:opacity', 'transition-timing-function:cubic-bezier(0.4,0,0.2,1)', 'transition-duration:150ms'),
        'transition-transform': D('transition-property:transform', 'transition-timing-function:cubic-bezier(0.4,0,0.2,1)', 'transition-duration:150ms'),
        'ease-out': D('transition-timing-function:cubic-bezier(0,0,0.2,1)'), 'ease-in': D('transition-timing-function:cubic-bezier(0.4,0,1,1)'),
        'ease-in-out': D('transition-timing-function:cubic-bezier(0.4,0,0.2,1)'),
        'animate-spin': D('animation:spin 1s linear infinite'),
        'animate-pulse': D('animation:pulse 2s cubic-bezier(0.4,0,0.6,1) infinite'),
        'scroll-smooth': D('scroll-behavior:smooth'),
        'snap-x': D('scroll-snap-type:x proximity'), 'snap-start': D('scroll-snap-align:start'), 'snap-center': D('scroll-snap-align:center'),
        'bg-gradient-to-r': D('background-image:linear-gradient(to right, var(--tw-gradient-stops))'),
        'bg-gradient-to-l': D('background-image:linear-gradient(to left, var(--tw-gradient-stops))'),
        'bg-gradient-to-t': D('background-image:linear-gradient(to top, var(--tw-gradient-stops))'),
        'bg-gradient-to-b': D('background-image:linear-gradient(to bottom, var(--tw-gradient-stops))'),
        'bg-gradient-to-br': D('background-image:linear-gradient(to bottom right, var(--tw-gradient-stops))'),
        'bg-gradient-to-tr': D('background-image:linear-gradient(to top right, var(--tw-gradient-stops))'),
        'bg-gradient-to-bl': D('background-image:linear-gradient(to bottom left, var(--tw-gradient-stops))'),
        'bg-gradient-to-tl': D('background-image:linear-gradient(to top left, var(--tw-gradient-stops))'),
        'ring': D('--tw-ring-shadow:var(--tw-ring-inset) 0 0 0 calc(3px + var(--tw-ring-offset-width)) var(--tw-ring-color)', SHADOW_DECL.replace('var(--tw-shadow)', 'var(--tw-shadow, 0 0 #0000)')),
        'drop-shadow-md': D('filter:drop-shadow(0 4px 3px rgb(0 0 0 / 0.07)) drop-shadow(0 2px 2px rgb(0 0 0 / 0.06))'),
        'drop-shadow-lg': D('filter:drop-shadow(0 10px 8px rgb(0 0 0 / 0.04)) drop-shadow(0 4px 3px rgb(0 0 0 / 0.1))'),
        'outline-none': D('outline:2px solid transparent', 'outline-offset:2px'),
        'resize-none': D('resize:none'),
    }
    if u in simple:
        return (0, simple[u]) if simple[u] else None

    # ---- inset / posisi ----
    m = re.fullmatch(r'(inset|inset-x|inset-y|top|right|bottom|left)-(.+)', u)
    if m:
        v = spacing(m.group(2), neg, SIZE_EXTRA)
        if v is None: return None
        props = {'inset': ['top', 'right', 'bottom', 'left'], 'inset-x': ['left', 'right'], 'inset-y': ['top', 'bottom']}.get(m.group(1), [m.group(1)])
        return (10, ['%s:%s' % (p, v) for p in props])
    m = re.fullmatch(r'z-(\d+|\[\d+\]|auto)', u)
    if m: return (11, ['z-index:%s' % m.group(1).strip('[]')])
    # ---- grid ----
    m = re.fullmatch(r'grid-cols-(\d+)', u)
    if m: return (20, ['grid-template-columns:repeat(%s, minmax(0, 1fr))' % m.group(1)])
    m = re.fullmatch(r'grid-rows-(\d+)', u)
    if m: return (20, ['grid-template-rows:repeat(%s, minmax(0, 1fr))' % m.group(1)])
    m = re.fullmatch(r'col-span-(\d+)', u)
    if m: return (19, ['grid-column:span %s / span %s' % (m.group(1), m.group(1))])
    m = re.fullmatch(r'auto-cols-\[(.+)\]', u)
    if m: return (21, ['grid-auto-columns:' + arb(m.group(1))])
    # ---- margin / padding ----
    m = re.fullmatch(r'(m|mx|my|mt|mr|mb|ml|p|px|py|pt|pr|pb|pl)-(.+)', u)
    if m:
        v = spacing(m.group(2), neg, {'auto': 'auto'} if m.group(1).startswith('m') else None)
        if v is None: return None
        k = m.group(1)
        base = 'margin' if k[0] == 'm' else 'padding'
        sides = {'': None, 'x': ['left', 'right'], 'y': ['top', 'bottom'], 't': ['top'], 'r': ['right'], 'b': ['bottom'], 'l': ['left']}[k[1:]]
        order = {'m': 30, 'mx': 31, 'my': 32, 'mt': 33, 'mr': 34, 'mb': 35, 'ml': 36, 'p': 40, 'px': 41, 'py': 42, 'pt': 43, 'pr': 44, 'pb': 45, 'pl': 46}[k]
        if sides is None: return (order, ['%s:%s' % (base, v)])
        return (order, ['%s-%s:%s' % (base, s, v) for s in sides])
    m = re.fullmatch(r'space-(x|y)-(.+)', u)
    if m:
        v = spacing(m.group(2), neg)
        if v is None: return None
        if m.group(1) == 'x':
            return (50, (['margin-right:%s' % v, 'margin-left:%s' % ('calc(%s * 1)' % v), ], ' > :not([hidden]) ~ :not([hidden])'))
        return (50, (['margin-top:%s' % v, 'margin-bottom:0px'], ' > :not([hidden]) ~ :not([hidden])'))
    m = re.fullmatch(r'gap(-x|-y)?-(.+)', u)
    if m:
        v = spacing(m.group(2))
        if v is None: return None
        p = {None: 'gap', '-x': 'column-gap', '-y': 'row-gap'}[m.group(1)]
        return (51, ['%s:%s' % (p, v)])
    # ---- tamanho ----
    m = re.fullmatch(r'(w|h|min-w|min-h|max-w|max-h)-(.+)', u)
    if m:
        k, v0 = m.groups()
        extra = dict(SIZE_EXTRA)
        if k == 'w': extra.update({'screen': '100vw'})
        if k == 'h': extra.update({'screen': '100vh'})
        if k == 'min-h': extra.update({'screen': '100vh', 'full': '100%'})
        if k == 'max-w': extra = dict(MAXW)
        if k == 'max-h': extra.update({'screen': '100vh'})
        if k in ('min-w', 'min-h'): extra['0'] = '0px'
        v = spacing(v0, False, extra)
        if v is None: return None
        prop = {'w': 'width', 'h': 'height', 'min-w': 'min-width', 'min-h': 'min-height', 'max-w': 'max-width', 'max-h': 'max-height'}[k]
        return (60 + ['w', 'min-w', 'max-w', 'h', 'min-h', 'max-h'].index(k), ['%s:%s' % (prop, v)])
    # ---- tipografi ----
    m = re.fullmatch(r'text-(.+)', u)
    if m:
        v = m.group(1)
        if v in SIZES: return (80, ['font-size:%s' % SIZES[v][0], 'line-height:%s' % SIZES[v][1]])
        if v.startswith('[') and v.endswith(']'):
            inner = arb(v[1:-1])
            if re.match(r'^[\d.]+(px|rem|em|vw|vh|%)$', inner): return (80, ['font-size:%s' % inner])
        c = color(v)
        if c: return (82, ['color:%s' % c])
        return None
    m = re.fullmatch(r'font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)', u)
    if m: return (81, ['font-weight:%d' % WEIGHT[m.group(1)]])
    m = re.fullmatch(r'leading-(.+)', u)
    if m and m.group(1) in LEAD: return (83, ['line-height:%s' % LEAD[m.group(1)]])
    m = re.fullmatch(r'tracking-(.+)', u)
    if m:
        v = m.group(1)
        if v in TRACK: return (84, ['letter-spacing:%s' % TRACK[v]])
        if v.startswith('['): return (84, ['letter-spacing:%s' % arb(v[1:-1])])
        return None
    m = re.fullmatch(r'line-clamp-(\d)', u)
    if m: return (85, ['overflow:hidden', 'display:-webkit-box', '-webkit-box-orient:vertical', '-webkit-line-clamp:%s' % m.group(1)])
    # ---- warna ----
    m = re.fullmatch(r'bg-(.+)', u)
    if m:
        c = color(m.group(1))
        return (90, ['background-color:%s' % c]) if c else None
    m = re.fullmatch(r'fill-(.+)', u)
    if m:
        c = color(m.group(1))
        return (91, ['fill:%s' % c]) if c else None
    m = re.fullmatch(r'(from|via|to)-(.+)', u)
    if m:
        c = color(m.group(2))
        if not c: return None
        if m.group(1) == 'from':
            tr = re.sub(r'rgb\((\d+ \d+ \d+)( / [\d.]+)?\)', r'rgb(\1 / 0)', c) if c.startswith('rgb') else 'transparent'
            return (92, ['--tw-gradient-from:%s' % c, '--tw-gradient-to:%s' % tr, '--tw-gradient-stops:var(--tw-gradient-from), var(--tw-gradient-to)'])
        if m.group(1) == 'via':
            tr = re.sub(r'rgb\((\d+ \d+ \d+)( / [\d.]+)?\)', r'rgb(\1 / 0)', c) if c.startswith('rgb') else 'transparent'
            return (93, ['--tw-gradient-to:%s' % tr, '--tw-gradient-stops:var(--tw-gradient-from), %s, var(--tw-gradient-to)' % c])
        return (94, ['--tw-gradient-to:%s' % c])
    # ---- border ----
    m = re.fullmatch(r'border(?:-(t|r|b|l|x|y))?(?:-(\d+))?', u)
    if m and u != 'border-':
        side, w = m.groups()
        if w is not None and w not in ('0', '2', '4', '8'): return None
        w = (w or '1') + 'px'
        sides = {None: ['border-width:%s'], 't': ['border-top-width:%s'], 'r': ['border-right-width:%s'], 'b': ['border-bottom-width:%s'],
                 'l': ['border-left-width:%s'], 'x': ['border-left-width:%s', 'border-right-width:%s'], 'y': ['border-top-width:%s', 'border-bottom-width:%s']}[side]
        return (95, [s % w for s in sides])
    m = re.fullmatch(r'border-(t|r|b|l)-(.+)', u)
    if m:
        c = color(m.group(2))
        if c: return (97, ['border-%s-color:%s' % ({'t': 'top', 'r': 'right', 'b': 'bottom', 'l': 'left'}[m.group(1)], c)])
        return None
    m = re.fullmatch(r'border-(.+)', u)
    if m:
        c = color(m.group(1))
        return (96, ['border-color:%s' % c]) if c else None
    m = re.fullmatch(r'rounded(?:-(t|r|b|l))?(?:-(none|sm|md|lg|xl|2xl|3xl|full))?', u)
    if m:
        side, size = m.groups()
        rv = RAD[size or '']
        props = {None: ['border-radius'], 't': ['border-top-left-radius', 'border-top-right-radius'], 'b': ['border-bottom-left-radius', 'border-bottom-right-radius'],
                 'l': ['border-top-left-radius', 'border-bottom-left-radius'], 'r': ['border-top-right-radius', 'border-bottom-right-radius']}[side]
        return (100 + (0 if side is None else 1), ['%s:%s' % (p, rv) for p in props])
    # ---- efek ----
    m = re.fullmatch(r'shadow(?:-(.+))?', u)
    if m:
        k = m.group(1) or ''
        if k in SHADOW:
            return (110, ['--tw-shadow:%s' % SHADOW[k][0], '--tw-shadow-colored:%s' % SHADOW[k][1], SHADOW_DECL])
        c = color(k)
        if c: return (111, ['--tw-shadow-color:%s' % c, '--tw-shadow:var(--tw-shadow-colored)'])
        return None
    m = re.fullmatch(r'ring-(\d+)', u)
    if m: return (112, ['--tw-ring-shadow:var(--tw-ring-inset) 0 0 0 calc(%spx + var(--tw-ring-offset-width)) var(--tw-ring-color)' % m.group(1),
                        SHADOW_DECL.replace('var(--tw-shadow)', 'var(--tw-shadow, 0 0 #0000)')])
    m = re.fullmatch(r'ring-(.+)', u)
    if m:
        c = color(m.group(1))
        return (113, ['--tw-ring-color:%s' % c]) if c else None
    m = re.fullmatch(r'opacity-(\d+)', u)
    if m: return (114, ['opacity:%g' % (int(m.group(1)) / 100.0)])
    m = re.fullmatch(r'backdrop-blur(?:-(sm|md|lg|xl|2xl|3xl|none))?', u)
    if m:
        b = BLUR[m.group(1) or '']
        return (115, ['-webkit-backdrop-filter:blur(%s)' % b, 'backdrop-filter:blur(%s)' % b])
    m = re.fullmatch(r'duration-(\d+)', u)
    if m: return (116, ['transition-duration:%sms' % m.group(1)])
    m = re.fullmatch(r'scale-(?:\[(.+)\]|(\d+))', u)
    if m:
        v = m.group(1) or ('%g' % (int(m.group(2)) / 100.0))
        return (117, ['--tw-scale-x:%s' % v, '--tw-scale-y:%s' % v, TRANSFORM])
    m = re.fullmatch(r'translate-(x|y)-(.+)', u)
    if m:
        v = spacing(m.group(2), neg)
        if v is None: return None
        return (118, ['--tw-translate-%s:%s' % (m.group(1), v), TRANSFORM])
    m = re.fullmatch(r'animate-(.+)', u)
    return None

VARIANTS = ['hover', 'focus', 'active', 'group-hover', 'sm', 'md', 'lg', 'xl']
BP = {'sm': '640px', 'md': '768px', 'lg': '1024px', 'xl': '1280px'}

def esc(t):
    return re.sub(r'([^A-Za-z0-9_-])', r'\\\1', t)

def split_variants(tok):
    parts, depth, cur = [], 0, ''
    for ch in tok:
        if ch == '[': depth += 1
        if ch == ']': depth -= 1
        if ch == ':' and depth == 0:
            parts.append(cur); cur = ''
        else: cur += ch
    parts.append(cur)
    return parts[:-1], parts[-1]

out_rules = []
for tok in sorted(tokens):
    vs, u = split_variants(tok)
    if any(v not in VARIANTS for v in vs): continue
    imp = u.startswith('!')
    if imp: u = u[1:]
    if not u or u[0] in '.$({[' : continue
    r = handle(u)
    if r is None:
        if re.match(r'^-?(?:[a-z]+-)', u) or u in ('ring',): unknown.add(tok)
        continue
    rank, body = r
    extra = ''
    if isinstance(body, tuple): body, extra = body
    sel = '.' + esc(tok)
    mq = None
    pseudo = ''
    group = False
    for v in vs:
        if v in BP: mq = BP[v]
        elif v == 'group-hover': group = True
        else: pseudo += ':' + v
    sel = ('.group:hover ' + sel if group else sel) + (pseudo if not group else '') + extra
    vrank = 0
    for v in vs:
        vrank = max(vrank, VARIANTS.index(v) + 1)
    decls = ';'.join(d + (' !important' if imp else '') for d in body)
    out_rules.append((vrank, rank, tok, mq, '%s{%s}' % (sel, decls)))

out_rules.sort(key=lambda x: (x[0], x[1], x[2]))

PREFLIGHT = '''/* ==========================================================================
   Musify — utilities.css (dibangkitkan otomatis oleh tools/twgen.py)
   Pengganti Tailwind CDN: statis, tanpa kompilasi di browser.
   ========================================================================== */
*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:#e5e7eb}
::before,::after{--tw-content:''}
html{line-height:1.5;-webkit-text-size-adjust:100%;-moz-tab-size:4;tab-size:4;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",Roboto,system-ui,sans-serif;-webkit-tap-highlight-color:transparent}
body{margin:0;line-height:inherit}
hr{height:0;color:inherit;border-top-width:1px}
abbr:where([title]){text-decoration:underline dotted}
h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}
a{color:inherit;text-decoration:inherit}
b,strong{font-weight:bolder}
code,kbd,samp,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:1em}
small{font-size:80%}
sub,sup{font-size:75%;line-height:0;position:relative;vertical-align:baseline}
sub{bottom:-.25em}sup{top:-.5em}
table{text-indent:0;border-color:inherit;border-collapse:collapse}
button,input,optgroup,select,textarea{font-family:inherit;font-feature-settings:inherit;font-variation-settings:inherit;font-size:100%;font-weight:inherit;line-height:inherit;letter-spacing:inherit;color:inherit;margin:0;padding:0}
button,select{text-transform:none}
button,[type='button'],[type='reset'],[type='submit']{-webkit-appearance:button;background-color:transparent;background-image:none}
:-moz-focusring{outline:auto}
progress{vertical-align:baseline}
::-webkit-inner-spin-button,::-webkit-outer-spin-button{height:auto}
[type='search']{-webkit-appearance:textfield;outline-offset:-2px}
::-webkit-search-decoration{-webkit-appearance:none}
::-webkit-file-upload-button{-webkit-appearance:button;font:inherit}
summary{display:list-item}
blockquote,dl,dd,h1,h2,h3,h4,h5,h6,hr,figure,p,pre{margin:0}
fieldset{margin:0;padding:0}legend{padding:0}
ol,ul,menu{list-style:none;margin:0;padding:0}
textarea{resize:vertical}
input::placeholder,textarea::placeholder{opacity:1;color:#9ca3af}
button,[role="button"]{cursor:pointer}
:disabled{cursor:default}
img,svg,video,canvas,audio,iframe,embed,object{display:block;vertical-align:middle}
img,video{max-width:100%;height:auto}
[hidden]{display:none}
*,::before,::after{--tw-translate-x:0;--tw-translate-y:0;--tw-rotate:0;--tw-skew-x:0;--tw-skew-y:0;--tw-scale-x:1;--tw-scale-y:1;--tw-ring-inset: ;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-color:rgb(59 130 246 / .5);--tw-ring-offset-shadow:0 0 #0000;--tw-ring-shadow:0 0 #0000;--tw-shadow:0 0 #0000;--tw-shadow-colored:0 0 #0000}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{50%{opacity:.5}}
'''

css = [PREFLIGHT]
cur_mq = None
for vrank, rank, tok, mq, rule in out_rules:
    if mq != cur_mq:
        if cur_mq: css.append('}')
        if mq: css.append('@media (min-width:%s){' % mq)
        cur_mq = mq
    css.append(rule)
if cur_mq: css.append('}')
# media query rules harus di akhir: urutkan ulang (non-mq dulu)
plain = [r for r in out_rules if r[3] is None]
mqs = [r for r in out_rules if r[3] is not None]
body = [PREFLIGHT] + [r[4] for r in plain]
for bp in ['640px', '768px', '1024px', '1280px']:
    grp = [r for r in mqs if r[3] == bp]
    if grp: body.append('@media (min-width:%s){%s}' % (bp, ''.join(r[4] for r in grp)))
open(out, 'w', encoding='utf8').write('\n'.join(body) + '\n')
print('rules:', len(out_rules), 'bytes:', os.path.getsize(out))
if unk_out:
    open(unk_out, 'w').write('\n'.join(sorted(unknown)))
    print('unknown-looking:', len(unknown))
