var Search={
    _seq:0,_ctl:null,_tmr:null,_sTmr:null,_sCtl:null,_saveTmr:null,_cache:{},_cacheKeys:[],_sugCache:{},_bound:false,
    RECENT_KEY:'nm_recent_search',
    render(){
        gid('view-search').innerHTML=`
        <div id="search-head" class="nm-search-head sticky top-0 z-30 px-4 pt-7 pb-3">
            <h1 class="text-[26px] font-black text-white tracking-tight mb-3">Cari</h1>
            <form id="search-form" class="nm-search-box relative" autocomplete="off" role="search">
                <span class="nm-search-ico"><i data-lucide="search" class="w-[18px] h-[18px]"></i></span>
                <input type="text" id="search-input" inputmode="search" enterkeyhint="search" autocapitalize="off" autocorrect="off" spellcheck="false" class="nm-search-input" placeholder="Cari lagu, artis, atau album" autocomplete="off" />
                <button type="button" id="search-clear" data-act="clear" class="nm-search-x hidden" aria-label="Hapus"><i data-lucide="x" class="w-4 h-4"></i></button>
            </form>
            <div id="suggestions" class="nm-suggest hidden"></div>
        </div>
        <div id="filter-tabs" class="nm-filter hidden px-4 pt-3 pb-1">
            <button onclick="setFilter('songs')" id="f-songs" class="filter-tab"></button>
            <button onclick="setFilter('artists')" id="f-artists" class="filter-tab"></button>
            <button onclick="setFilter('playlists')" id="f-playlists" class="filter-tab"></button>
        </div>
        <div id="search-recent" class="hidden px-4 mt-3"></div>
        <div class="px-4 mt-2" id="search-results"></div>
        <div id="search-recs" class="px-4 mt-2 space-y-6 pb-8"></div>`;
        lucide.createIcons();Search.events();Search.updateFilterUI();
    },
    query(q){
        App.switch('search');
        var si = gid('search-input');
        if (si) {
            si.value = q;
            var sf = gid('search-form');
            if (sf) sf.dispatchEvent(new Event('submit',{cancelable:true}));
        }
    },
    onShow(){if(!S.sq){Search.renderRecs();Search.renderRecent();}},
    // ---------- Riwayat pencarian ----------
    recent(){try{var l=JSON.parse(localStorage.getItem(Search.RECENT_KEY)||'[]');return Array.isArray(l)?l:[];}catch(e){return[];}},
    saveRecent(q){
        q=String(q||'').trim();if(q.length<2)return;
        var l=Search.recent().filter(function(x){return String(x).toLowerCase()!==q.toLowerCase();});
        l.unshift(q);
        try{localStorage.setItem(Search.RECENT_KEY,JSON.stringify(l.slice(0,10)));}catch(e){}
    },
    removeRecent(q){
        var l=Search.recent().filter(function(x){return x!==q;});
        try{localStorage.setItem(Search.RECENT_KEY,JSON.stringify(l));}catch(e){}
        Search.renderRecent();
    },
    clearRecent(){try{localStorage.removeItem(Search.RECENT_KEY);}catch(e){}Search.renderRecent();},
    renderRecent(){
        var box=gid('search-recent');if(!box)return;
        var l=S.sq?[]:Search.recent();
        if(!l.length){box.classList.add('hidden');box.innerHTML='';return;}
        box.classList.remove('hidden');
        box.innerHTML='<div class="flex items-center justify-between mb-1.5"><h2 class="text-sm font-bold text-white/90">Pencarian terakhir</h2><button data-act="clear-all" class="text-xs font-semibold text-white/50 active:text-white">Hapus semua</button></div>'+
            l.slice(0,6).map(function(q){
                return '<div data-act="pick" data-q="'+es(q)+'" class="flex items-center gap-3 py-2.5 px-1 rounded-xl active:bg-white/5 cursor-pointer"><span class="w-8 h-8 rounded-full bg-white/[0.07] flex items-center justify-center text-white/60 shrink-0"><i data-lucide="history" class="w-4 h-4"></i></span><span class="flex-1 truncate text-sm font-medium text-white/90">'+es(q)+'</span><button data-act="rm" data-q="'+es(q)+'" class="w-8 h-8 flex items-center justify-center text-white/40 active:text-white shrink-0" aria-label="Hapus"><i data-lucide="x" class="w-4 h-4"></i></button></div>';
            }).join('');
        lucide.createIcons();
    },
    REC_ROWS:[
        {key:'rec0',label:'Rilis Anyar',q:'baru rilis',icon:'<i data-lucide="sparkles" class="w-4 h-4 text-amber-400"></i>'},
        {key:'rec1',label:'Barat Top',q:'barat Top',icon:'<i data-lucide="globe" class="w-4 h-4 text-sky-400"></i>'},
        {key:'rec2',label:'Rapp Top',q:'Rapp Top',icon:'<i data-lucide="flame" class="w-4 h-4 text-rose-400"></i>'}
    ],
    renderRecs(){
        var rc=gid('search-recs');if(!rc)return;
        if(S.rec0&&S.rec1&&S.rec2){Search.showRecs();return;}
        rc.innerHTML=Search.REC_ROWS.map(function(row){
            return '<div><div class="h-5 w-32 bg-white/10 rounded mb-3 animate-pulse"></div><div class="flex gap-3 overflow-x-auto hide-scrollbar pb-1">'+
                Array(4).fill(0).map(function(){return '<div class="flex-shrink-0 w-32 animate-pulse"><div class="w-32 h-32 rounded-xl bg-white/5 mb-2"></div><div class="h-3 bg-white/10 rounded w-3/4"></div></div>';}).join('')+
            '</div></div>';
        }).join('');
        Promise.all(Search.REC_ROWS.map(function(row){
            return fetch(API.search+'?query='+encodeURIComponent(row.q)+'&type=songs').then(function(r){return r.json();}).then(function(d){
                S[row.key]=d.status&&d.result.songs?d.result.songs.map(function(s){return{id:s.videoId,videoId:s.videoId,title:cn(s.title),artist:cn(s.artist),artistId:s.artistId||'',cover:toHDCover(s.thumbnail,s.videoId),ytUrl:s.url};}):[];
            }).catch(function(){S[row.key]=[];});
        })).then(function(){Search.showRecs();});
    },
    showRecs(){
        var rc=gid('search-recs');if(!rc)return;
        rc.innerHTML=Search.REC_ROWS.map(function(row){
            var list=(S[row.key]||[]).slice(0,6);
            if(list.length===0)return '';
            var cardsHtml=list.map(function(t,i){
                var isCur = S.ct && (
                    S.ct.id === t.id ||
                    S.ct.videoId === t.id ||
                    (S.ct.id && t.videoId && S.ct.id === t.videoId) ||
                    (S.ct.videoId && t.id && S.ct.videoId === t.id) ||
                    (S.ct.title === t.title && S.ct.artist === t.artist)
                );
                var isPlay = isCur && S.ip;
                var isLoad = isCur && S.il;
                var recBtn = '';
                var ringClass = '';

                if(isLoad) {
                    recBtn = '<div class="absolute bottom-1.5 right-1.5 btn-chrome rounded-full p-2  shadow-black/40"><div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div></div>';
                    ringClass = 'ring-2 ring-white/60 scale-[1.02]  shadow-white/10';
                } else if(isPlay) {
                    recBtn = '<div class="absolute bottom-1.5 right-1.5 bg-white text-black rounded-full p-2  shadow-white/30 ring-2 ring-white scale-105"><div class="flex items-end justify-center gap-[2px] w-3.5 h-3.5 pb-0.5"><span class="w-[2px] bg-black rounded-full animate-eq-1"></span><span class="w-[2px] bg-black rounded-full animate-eq-2"></span><span class="w-[2px] bg-black rounded-full animate-eq-3"></span></div></div>';
                    ringClass = 'ring-2 ring-white scale-[1.02]  shadow-white/20';
                } else if(isCur) {
                    recBtn = '<div class="absolute bottom-1.5 right-1.5 bg-white text-black rounded-full p-2  scale-105 border border-white"><i data-lucide="pause" class="w-3.5 h-3.5 fill-current"></i></div>';
                    ringClass = 'ring-2 ring-white/60 shadow-md';
                } else {
                    recBtn = '<div class="absolute bottom-1.5 right-1.5 btn-chrome rounded-full p-2  shadow-black/40 hover:scale-110 transition-all"><i data-lucide="play" class="w-3.5 h-3.5 fill-current ml-0.5"></i></div>';
                    ringClass = '';
                }

                return '<div onclick="PK(\''+row.key+'\','+i+')" class="search-rec-item flex-shrink-0 w-36 cursor-pointer active:scale-95 group p-2.5 rounded-2xl bg-[#13151b] border border-white/10 shadow-xl hover:bg-[#1b1e26] transition-all flex flex-col animate-card-left" style="animation-delay:'+Math.min(i*50, 450)+'ms"><div class="search-rec-cover w-full aspect-square mb-2 relative rounded-xl overflow-hidden shadow-md transition-all '+ringClass+'"><img src="'+t.cover+'" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" onerror="this.src=\''+FI+'\'" /><div class="search-rec-btn">'+recBtn+'</div></div><h3 class="search-rec-title font-semibold text-xs truncate text-white px-0.5 '+(isCur?'font-black':'')+'">'+es(t.title)+'</h3><p class="text-white/60 text-[10px] truncate mt-0.5 px-0.5">'+es(t.artist)+'</p></div>';
            }).join('');
            return '<div class="animate-card-up"><h2 class="text-base font-bold mb-3 flex items-center gap-2 text-white">'+(row.icon||'<span class="w-1.5 h-4 bg-white/90 rounded-full inline-block"></span>')+'<span>'+row.label+'</span></h2><div class="flex gap-3 overflow-x-auto hide-scrollbar pb-1">'+cardsHtml+'</div></div>';
        }).join('');
        lucide.createIcons();
    },
    state(t){
        var isCur = !!(S.ct && (
            S.ct.id === t.id || S.ct.videoId === t.id ||
            (S.ct.id && t.videoId && S.ct.id === t.videoId) ||
            (S.ct.videoId && t.id && S.ct.videoId === t.id) ||
            (S.ct.title === t.title && S.ct.artist === t.artist)
        ));
        return {cur:isCur, play:isCur && S.ip, load:isCur && S.il};
    },
    btnHtml(st,big){
        var sz = big ? 'w-11 h-11' : 'w-9 h-9';
        if (st.load) return '<div class="'+sz+' rounded-full bg-white/20 flex items-center justify-center shrink-0"><div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div></div>';
        if (st.play) return '<div class="'+sz+' rounded-full bg-white text-black flex items-center justify-center shrink-0"><div class="flex items-end justify-center gap-[2.5px] w-4 h-4 pb-0.5"><span class="w-[2.5px] bg-black rounded-full animate-eq-1"></span><span class="w-[2.5px] bg-black rounded-full animate-eq-2"></span><span class="w-[2.5px] bg-black rounded-full animate-eq-3"></span></div></div>';
        if (st.cur) return '<div class="'+sz+' rounded-full bg-white text-black flex items-center justify-center shrink-0"><i data-lucide="pause" class="w-4 h-4 fill-current"></i></div>';
        return '<div class="'+(big?'w-11 h-11':'w-8 h-8')+' rounded-full '+(big?'bg-white text-black':'bg-white/10 text-white')+' flex items-center justify-center shrink-0"><i data-lucide="play" class="w-4 h-4 fill-current ml-0.5"></i></div>';
    },
    rowClass(st){
        return 'search-song-item flex items-center gap-3.5 p-2.5 mb-2 rounded-2xl cursor-pointer active:scale-[0.98] transition-colors ' +
            (st.play ? 'bg-[#232835] border border-white/40' : (st.cur ? 'bg-[#1e222d] border border-white/30' : 'bg-[#13151b] border border-white/10 hover:bg-[#1b1e26]'));
    },
    badgeHtml(st){
        return st.play ? '<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-white/20 text-white font-bold uppercase tracking-wider ml-2 border border-white/30">Diputar</span>'
            : (st.cur ? '<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/80 font-bold uppercase tracking-wider ml-2 border border-white/20">Dijeda</span>' : '');
    },
    renderActive(){
        var c = gid('search-results');
        if (c && S.sq && S.filter === 'songs' && S.sr) {
            c.querySelectorAll('.search-song-item').forEach(function(el){
                var t = S.sr[+el.getAttribute('data-i')];
                if (!t) return;
                var st = Search.state(t);
                el.className = Search.rowClass(st);
                var titleEl = el.querySelector('.search-song-title');
                if (titleEl) titleEl.className = 'search-song-title font-semibold text-sm truncate ' + (st.cur ? 'text-white font-black' : 'text-white');
                var badgeEl = el.querySelector('.search-song-badge');
                if (badgeEl) badgeEl.innerHTML = Search.badgeHtml(st);
                var btnEl = el.querySelector('.search-song-btn');
                if (btnEl) btnEl.innerHTML = Search.btnHtml(st, false);
            });
            var tp = c.querySelector('.search-top-btn');
            if (tp && S.sr[0]) tp.innerHTML = Search.btnHtml(Search.state(S.sr[0]), true);
        }

        var rc = gid('search-recs');
        if (rc && !S.sq) {
            Search.REC_ROWS.forEach(function(row){
                var list = (S[row.key] || []).slice(0, 6);
                list.forEach(function(t, i){
                    var isCur = S.ct && (
                        S.ct.id === t.id ||
                        S.ct.videoId === t.id ||
                        (S.ct.id && t.videoId && S.ct.id === t.videoId) ||
                        (S.ct.videoId && t.id && S.ct.videoId === t.id) ||
                        (S.ct.title === t.title && S.ct.artist === t.artist)
                    );
                    var isPlay = isCur && S.ip;
                    var isLoad = isCur && S.il;
                    var recBtn = '';
                    var ringClass = '';

                    if(isLoad) {
                        recBtn = '<div class="absolute bottom-1.5 right-1.5 btn-chrome rounded-full p-2  shadow-black/40"><div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div></div>';
                        ringClass = 'ring-2 ring-white/60 scale-[1.02]  shadow-white/10';
                    } else if(isPlay) {
                        recBtn = '<div class="absolute bottom-1.5 right-1.5 bg-white text-black rounded-full p-2  shadow-white/30 ring-2 ring-white scale-105"><div class="flex items-end justify-center gap-[2px] w-3.5 h-3.5 pb-0.5"><span class="w-[2px] bg-black rounded-full animate-eq-1"></span><span class="w-[2px] bg-black rounded-full animate-eq-2"></span><span class="w-[2px] bg-black rounded-full animate-eq-3"></span></div></div>';
                        ringClass = 'ring-2 ring-white scale-[1.02]  shadow-white/20';
                    } else if(isCur) {
                        recBtn = '<div class="absolute bottom-1.5 right-1.5 bg-white text-black rounded-full p-2  scale-105 border border-white"><i data-lucide="pause" class="w-3.5 h-3.5 fill-current"></i></div>';
                        ringClass = 'ring-2 ring-white/60 shadow-md';
                    } else {
                        recBtn = '<div class="absolute bottom-1.5 right-1.5 btn-chrome rounded-full p-2  shadow-black/40 hover:scale-110 transition-all"><i data-lucide="play" class="w-3.5 h-3.5 fill-current ml-0.5"></i></div>';
                        ringClass = '';
                    }

                    var card = rc.querySelector('[onclick*="PK(\''+row.key+'\','+i+')"]');
                    if(card) {
                        var cover = card.querySelector('.search-rec-cover');
                        if(cover) cover.className = 'search-rec-cover w-32 h-32 mb-2 relative rounded-xl overflow-hidden glass-edge  transition-all ' + ringClass;
                        var btn = card.querySelector('.search-rec-btn');
                        if(btn) btn.innerHTML = recBtn;
                        var title = card.querySelector('.search-rec-title');
                        if(title) title.className = 'search-rec-title font-semibold text-xs truncate ' + (isCur?'text-white font-black':'');
                    }
                });
            });
        }
        lucide.createIcons();
    },
    // ---------- Pencarian real-time ----------
    ingest(d){
        S.ar=d&&d.status&&d.result.songs?d.result.songs.map(function(s){return{id:s.videoId,videoId:s.videoId,title:cn(s.title),artist:cn(s.artist),artistId:s.artistId||'',cover:toHDCover(s.thumbnail,s.videoId),ytUrl:s.url};}):[];
        var pl=d&&d.status&&d.result.playlists?d.result.playlists:[];
        var al=d&&d.status&&d.result.albums?d.result.albums:[];
        S.pr=[].concat(al).concat(pl);
        S.art=d&&d.status&&d.result.artists?d.result.artists:[];
    },
    cacheGet(q){return Search._cache[q.toLowerCase()];},
    cacheSet(q,d){
        var k=q.toLowerCase();
        if(!Search._cache[k])Search._cacheKeys.push(k);
        Search._cache[k]=d;
        if(Search._cacheKeys.length>40)delete Search._cache[Search._cacheKeys.shift()];
    },
    run(q,opts){
        opts=opts||{};
        q=String(q||'').trim();
        S.sq=q;
        if(Search._ctl){try{Search._ctl.abort();}catch(e){}Search._ctl=null;}
        var my=++Search._seq;
        if(!q){S.ar=[];S.pr=[];S.art=[];S.sr=[];Search.show();return;}
        if(['songs','artists','playlists'].indexOf(S.filter)<0)S.filter='songs';
        // URL: submit = riwayat baru, ketikan live = ganti saja (tidak menumpuk history)
        try{
            var url=location.origin+'/search/'+encodeURIComponent(q);
            if(opts.push&&location.pathname.indexOf('/search/')!==0)history.pushState({},'',url);else history.replaceState({},'',url);
        }catch(e){}
        var cached=Search.cacheGet(q);
        if(cached){Search.ingest(cached);Search.afterData(opts);return;}
        Search.show('loading');
        var ctl=(typeof AbortController!=='undefined')?new AbortController():null;
        Search._ctl=ctl;
        fetch(API.search+'?query='+encodeURIComponent(q)+'&type=all',{signal:ctl?ctl.signal:undefined})
            .then(function(r){if(!r.ok)throw new Error('http '+r.status);return r.json();})
            .then(function(d){
                if(my!==Search._seq)return;           // jawaban basi (sudah ada ketikan baru) dibuang
                if(!d||!d.status)throw new Error('bad');
                Search.cacheSet(q,d);Search.ingest(d);Search.afterData(opts);
            })
            .catch(function(err){
                if(my!==Search._seq||(err&&err.name==='AbortError'))return;
                S.ar=[];S.pr=[];S.art=[];S.sr=[];
                Search.show('error');
            });
    },
    afterData(opts){
        Search.updateFilterUI();
        Search.apply(opts&&opts.animate);
        // simpan ke riwayat bila pengguna berhenti mengetik sebentar & ada hasil
        clearTimeout(Search._saveTmr);
        if(S.sq&&S.ar&&S.ar.length)Search._saveTmr=setTimeout(function(){Search.saveRecent(S.sq);},opts&&opts.push?0:1500);
    },
    hideSuggestions(){var el=gid('suggestions');if(el){el.classList.add('hidden');}},
    showSuggestions(q,list){
        var el=gid('suggestions');if(!el)return;
        if(!list||!list.length||gid('search-input').value.trim().toLowerCase()!==q.toLowerCase()){el.classList.add('hidden');return;}
        var ql=q.toLowerCase();
        el.innerHTML=list.slice(0,6).map(function(sg){
            var low=String(sg).toLowerCase(),label;
            if(low.indexOf(ql)===0)label='<span class="text-white/55">'+es(sg.slice(0,q.length))+'</span><span class="font-bold text-white">'+es(sg.slice(q.length))+'</span>';
            else label='<span class="font-semibold text-white">'+es(sg)+'</span>';
            return '<div data-act="pick" data-q="'+es(sg)+'" class="px-4 py-3 active:bg-white/10 hover:bg-white/[0.06] cursor-pointer text-sm flex items-center gap-3"><i data-lucide="search" class="w-3.5 h-3.5 text-white/50 shrink-0"></i><span class="truncate flex-1">'+label+'</span><i data-lucide="arrow-up-left" class="w-3.5 h-3.5 text-white/30 shrink-0"></i></div>';
        }).join('');
        el.classList.remove('hidden');
        lucide.createIcons();
    },
    fetchSuggest(q){
        var key=q.toLowerCase();
        if(Search._sugCache[key]){Search.showSuggestions(q,Search._sugCache[key]);return;}
        if(Search._sCtl){try{Search._sCtl.abort();}catch(e){}}
        var ctl=(typeof AbortController!=='undefined')?new AbortController():null;
        Search._sCtl=ctl;
        fetch(API.suggest+'?q='+encodeURIComponent(q),{signal:ctl?ctl.signal:undefined}).then(function(r){return r.json();}).then(function(l){
            if(!Array.isArray(l))l=[];
            Search._sugCache[key]=l;
            Search.showSuggestions(q,l);
        }).catch(function(){});
    },
    events(){
        var sf=gid('search-form'),si=gid('search-input'),view=gid('view-search');if(!sf||!si||!view)return;
        var clearBtn=gid('search-clear');
        function syncClear(){if(clearBtn)clearBtn.classList.toggle('hidden',!si.value);}

        sf.addEventListener('submit',function(e){
            e.preventDefault();
            clearTimeout(Search._tmr);clearTimeout(Search._sTmr);
            Search.hideSuggestions();
            var q=si.value.trim();syncClear();
            if(!q){Search.run('');return;}
            try{si.blur();}catch(x){}
            Search.run(q,{push:true,animate:true});
            var ma=gid('main-area');if(ma)ma.scrollTop=0;
        });

        si.addEventListener('input',function(){
            var q=this.value.trim();syncClear();
            clearTimeout(Search._tmr);clearTimeout(Search._sTmr);
            if(!q){Search.hideSuggestions();Search.run('');return;}
            if(q.length<2){Search.hideSuggestions();return;}
            // saran cepat (110ms) + hasil langsung (260ms) saat mengetik
            Search._sTmr=setTimeout(function(){Search.fetchSuggest(q);},110);
            Search._tmr=setTimeout(function(){Search.run(q,{animate:!(S.ar&&S.ar.length)});},260);
        });
        si.addEventListener('focus',function(){
            var q=si.value.trim();
            if(q.length>=2&&Search._sugCache[q.toLowerCase()])Search.showSuggestions(q,Search._sugCache[q.toLowerCase()]);
        });
        si.addEventListener('keydown',function(e){
            if(e.key==='Escape'){Search.hideSuggestions();si.blur();}
        });

        // Satu pendengar klik untuk semua aksi (saran, riwayat, hapus, ulangi)
        view.addEventListener('click',function(e){
            var a=e.target.closest('[data-act]');if(!a)return;
            var act=a.getAttribute('data-act'),q=a.getAttribute('data-q');
            if(act==='pick'){e.preventDefault();Search.hideSuggestions();Search.query(q);}
            else if(act==='rm'){e.stopPropagation();Search.removeRecent(q);}
            else if(act==='clear-all'){Search.clearRecent();}
            else if(act==='clear'){si.value='';syncClear();Search.hideSuggestions();Search.run('');si.focus();}
            else if(act==='retry'){Search.run(S.sq,{animate:true});}
        });
        document.addEventListener('click',function(e){if(!e.target.closest('#search-form')&&!e.target.closest('#suggestions'))Search.hideSuggestions();});
        var ma=gid('main-area');
        if(ma)ma.addEventListener('scroll',function(){if(document.activeElement===si&&ma.scrollTop>40){si.blur();}Search.hideSuggestions();},{passive:true});
    },
    TAB_ON:'filter-tab active',
    TAB_OFF:'filter-tab',
    updateFilterUI(){
        var counts={songs:(S.ar||[]).length,artists:(S.art||[]).length,playlists:(S.pr||[]).length};
        var names={songs:'Musik',artists:'Artis',playlists:'Playlist'};
        ['songs','artists','playlists'].forEach(function(k){
            var el=gid('f-'+k);if(!el)return;
            el.className=(S.filter===k)?Search.TAB_ON:Search.TAB_OFF;
            el.innerHTML=names[k]+(S.sq&&counts[k]?' <span class="opacity-60 font-semibold">'+counts[k]+'</span>':'');
        });
    },
    skeleton(){
        return Array(7).fill(0).map(function(_,i){
            return '<div class="flex items-center gap-3.5 p-2.5 mb-2 rounded-2xl bg-[#13151b] border border-white/5 animate-pulse" style="opacity:'+(1-i*0.11).toFixed(2)+'"><div class="w-12 h-12 rounded-xl bg-white/10 shrink-0"></div><div class="flex-1 space-y-2"><div class="h-3 bg-white/10 rounded w-2/3"></div><div class="h-2.5 bg-white/5 rounded w-1/3"></div></div><div class="w-8 h-8 rounded-full bg-white/5"></div></div>';
        }).join('');
    },
    rowHtml(t,i,anim){
        var st=Search.state(t);
        var delay=anim?' animate-card-up" style="animation-delay:'+Math.min(i*28,330)+'ms':'';
        return '<div data-i="'+i+'" onclick="PK(\'search\','+i+')" class="'+Search.rowClass(st)+delay+'">'+
            '<img src="'+toWebp(t.cover)+'" loading="lazy" decoding="async" class="w-12 h-12 rounded-xl object-cover shadow-md shrink-0 border border-white/10" onerror="handleImgError(this)" />'+
            '<div class="truncate flex-1 min-w-0"><div class="flex items-center"><h3 class="search-song-title font-semibold text-sm truncate '+(st.cur?'text-white font-black':'text-white')+'">'+es(t.title)+'</h3><span class="search-song-badge">'+Search.badgeHtml(st)+'</span></div><p class="text-white/60 text-xs truncate mt-0.5">'+es(t.artist)+'</p></div>'+
            '<div class="search-song-btn">'+Search.btnHtml(st,false)+'</div></div>';
    },
    topHtml(t,anim){
        var st=Search.state(t);
        return '<div onclick="PK(\'search\',0)" class="search-top flex items-center gap-4 p-3.5 mb-4 rounded-3xl cursor-pointer active:scale-[0.98] transition-transform border border-white/15'+(anim?' animate-card-up':'')+'" style="background:linear-gradient(135deg,#2a2e3f 0%,#1d2029 100%);">'+
            '<img src="'+toWebp(t.cover)+'" decoding="async" class="w-20 h-20 rounded-2xl object-cover shadow-xl shrink-0 border border-white/10" onerror="handleImgError(this)" />'+
            '<div class="flex-1 min-w-0"><p class="text-[10px] uppercase tracking-[.18em] font-bold text-white/45 mb-1">Hasil teratas</p><h3 class="text-lg font-black text-white truncate leading-tight">'+es(t.title)+'</h3><p class="text-white/60 text-sm truncate mt-0.5">'+es(t.artist)+'</p></div>'+
            '<div class="search-top-btn">'+Search.btnHtml(st,true)+'</div></div>';
    },
    artistStrip(anim){
        var list=(S.art||[]).slice(0,8);if(!list.length)return '';
        return '<div class="mb-4"><h2 class="text-sm font-bold text-white/90 mb-2.5">Artis</h2><div class="flex gap-3.5 overflow-x-auto hide-scrollbar pb-1 -mx-4 px-4">'+list.map(function(p){
            var nm=p.name||p.title;
            return '<div onclick="Artist.open(\''+esJs(p.id)+'\', \''+esJs(nm)+'\')" class="flex-shrink-0 w-[72px] text-center cursor-pointer active:scale-95 transition-transform"><img src="'+toWebp(p.cover)+'" loading="lazy" decoding="async" class="w-[72px] h-[72px] rounded-full object-cover border border-white/10 shadow-md" onerror="handleImgError(this)" /><p class="text-[11px] font-semibold text-white/90 truncate mt-1.5">'+es(nm)+'</p></div>';
        }).join('')+'</div></div>';
    },
    show(mode,anim){
        var c=gid('search-results'),rc=gid('search-recs'),ft=gid('filter-tabs');if(!c)return;
        if(!S.sq){
            c.innerHTML='';c.classList.remove('is-stale');
            if(rc)rc.style.display='';
            if(ft)ft.classList.add('hidden');
            Search.updateFilterUI();Search.renderRecent();
            return;
        }
        if(rc)rc.style.display='none';
        if(ft)ft.classList.remove('hidden');
        var rec=gid('search-recent');if(rec){rec.classList.add('hidden');}
        if(mode==='loading'){
            // Sudah ada hasil: biarkan tampil (redup) supaya tidak berkedip; belum ada: tampilkan kerangka
            if(c.querySelector('.search-song-item,.search-top,.search-grid'))c.classList.add('is-stale');
            else c.innerHTML=Search.skeleton();
            return;
        }
        c.classList.remove('is-stale');
        if(mode==='error'){
            c.innerHTML='<div class="text-center mt-14 px-6"><div class="w-14 h-14 rounded-full bg-white/[0.07] flex items-center justify-center mx-auto mb-3 text-white/60"><i data-lucide="wifi-off" class="w-6 h-6"></i></div><p class="text-white font-bold">Gagal memuat hasil</p><p class="text-white/50 text-sm mt-1">Periksa koneksi lalu coba lagi.</p><button data-act="retry" class="mt-4 px-5 py-2.5 rounded-full bg-white text-black text-sm font-extrabold active:scale-95">Coba lagi</button></div>';
            lucide.createIcons();return;
        }
        if(!S.sr||S.sr.length===0){
            c.innerHTML='<div class="text-center mt-14 px-6"><div class="w-14 h-14 rounded-full bg-white/[0.07] flex items-center justify-center mx-auto mb-3 text-white/60"><i data-lucide="search-x" class="w-6 h-6"></i></div><p class="text-white font-bold">Tidak ada hasil</p><p class="text-white/50 text-sm mt-1">Tidak ditemukan untuk &ldquo;'+es(S.sq)+'&rdquo; di tab ini.</p></div>';
            lucide.createIcons();return;
        }
        if(S.filter==='songs'){
            var html='';
            if(S.sr[0])html+=Search.topHtml(S.sr[0],anim);
            html+=Search.artistStrip(anim);
            if(S.sr.length>1)html+='<h2 class="text-sm font-bold text-white/90 mb-2.5">Lagu</h2>';
            html+=S.sr.slice(1).map(function(t,k){return Search.rowHtml(t,k+1,anim&&k<12);}).join('');
            c.innerHTML=html;
        }else if(S.filter==='artists'){
            c.innerHTML='<div class="search-grid grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pb-8">'+S.sr.map(function(p,i){
                var nm=p.name||p.title;
                return '<div onclick="Artist.open(\''+esJs(p.id)+'\', \''+esJs(nm)+'\')" class="p-3 rounded-2xl bg-[#13151b] border border-white/10 hover:bg-[#1b1e26] cursor-pointer active:scale-95 transition-transform text-center flex flex-col items-center justify-center'+(anim?' animate-card-up':'')+'" style="'+(anim?'animation-delay:'+Math.min(i*35,400)+'ms':'')+'"><div class="relative w-20 h-20 mb-2.5 rounded-full overflow-hidden border-2 border-white/10 shadow-md"><img src="'+toWebp(p.cover)+'" loading="lazy" decoding="async" class="w-full h-full object-cover" onerror="handleImgError(this)" /></div><h3 class="font-bold text-sm truncate text-white w-full px-1">'+es(nm)+'</h3><p class="text-white/55 text-[10px] uppercase tracking-wider font-semibold mt-0.5 truncate w-full">'+es(p.subtitle||p.artist||'Artis')+'</p></div>';
            }).join('')+'</div>';
        }else{
            c.innerHTML='<div class="search-grid grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pb-8">'+S.sr.map(function(p,i){
                var sub=p.albumType?(p.albumType+(p.year?' • '+p.year:'')+(p.artist?' • '+p.artist:'')):p.artist;
                return '<div onclick="Album.open(\''+esJs(p.id)+'\', \''+esJs(p.cover||FI)+'\')" class="p-2.5 rounded-2xl bg-[#13151b] border border-white/10 hover:bg-[#1b1e26] cursor-pointer active:scale-95 transition-transform flex flex-col'+(anim?' animate-card-up':'')+'" style="'+(anim?'animation-delay:'+Math.min(i*35,400)+'ms':'')+'"><div class="w-full aspect-square mb-2.5 rounded-xl overflow-hidden shadow-md"><img src="'+toWebp(p.cover)+'" loading="lazy" decoding="async" class="w-full h-full object-cover" onerror="handleImgError(this)" /></div><h3 class="font-semibold text-sm truncate text-white px-0.5">'+es(p.title)+'</h3><p class="text-white/60 text-xs truncate mt-0.5 px-0.5">'+es(sub)+'</p></div>';
            }).join('')+'</div>';
        }
        lucide.createIcons();
    },
    apply(anim){
        if(S.filter==='songs') S.sr=S.ar||[];
        else if(S.filter==='playlists') S.sr=S.pr||[];
        else if(S.filter==='artists') S.sr=S.art||[];
        Search.show(null,anim);
        Search.updateFilterUI();
    }
};
function selectSuggestion(t){Search.hideSuggestions();var si=gid('search-input');if(si)si.value=t;var sf=gid('search-form');if(sf)sf.dispatchEvent(new Event('submit',{cancelable:true}));}
function setFilter(f){S.filter=f;Search.apply(true);}
