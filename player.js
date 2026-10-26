/* Vimeo playback for the site.
   - project pages: any  .player[data-vimeo="https://vimeo.com/ID/HASH"]  becomes a chromeless player
     with custom controls (play/pause, timeline, sound, volume, fullscreen)
   - motion picture page: any  .project[data-preview="https://vimeo.com/ID/HASH"]  plays muted while hovered */
(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia('(any-hover: hover)').matches;
  function noop() {}

  function parse(url) {
    var m = /vimeo\.com\/(?:video\/)?(\d+)(?:\/([0-9a-f]+))?/i.exec(url || '');
    if (!m) return null;
    var h = m[2] || (/[?&]h=([0-9a-f]+)/i.exec(url) || [])[1];
    return { id: m[1], h: h };
  }

  function embed(v, extra) {
    var q = [];
    if (v.h) q.push('h=' + v.h);
    q = q.concat(['dnt=1', 'playsinline=1', 'title=0', 'byline=0', 'portrait=0', 'badge=0', 'autopause=0', 'controls=0'], extra);
    return 'https://player.vimeo.com/video/' + v.id + '?' + q.join('&');
  }

  function fmt(t) {
    t = Math.max(0, Math.floor(t || 0));
    return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  /* ---------- project page player ---------- */
  function buildPlayer(box) {
    var url = box.getAttribute('data-vimeo');
    var v = parse(url);
    if (!v) return;                       // no link yet: keep the placeholder
    var title = box.getAttribute('data-title') || 'film';

    if (!window.Vimeo) {                  // fallback if the Vimeo script is blocked
      box.innerHTML = '';
      var a = el('a', null, 'watch on vimeo');
      a.href = url;
      box.appendChild(a);
      return;
    }

    box.innerHTML = '';
    box.classList.add('ready');
    var fillFrame = box.getAttribute('data-fit') === 'cover';
    if (fillFrame) {
      box.classList.add('fit-cover', 'sizing');
      setTimeout(function () { box.classList.remove('sizing'); }, 2000);   // never leave it hidden
    }

    var stage = el('div', 'stage');
    var iframe = document.createElement('iframe');
    iframe.title = title;
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.setAttribute('allowfullscreen', '');
    iframe.src = embed(v, ['muted=1', 'autoplay=' + (reduceMotion ? 0 : 1)]);
    stage.appendChild(iframe);

    var bar = el('div', 'controls');
    var pp = el('button', 'pp', reduceMotion ? 'play' : 'pause');
    pp.type = 'button';
    var seek = el('input', 'seek');
    seek.type = 'range'; seek.min = 0; seek.max = 1000; seek.value = 0; seek.step = 1;
    seek.setAttribute('aria-label', 'timeline');
    var time = el('span', 'time', '0:00 / 0:00');
    var mute = el('button', 'mute', 'sound off');
    mute.type = 'button';
    var vol = el('input', 'vol');
    vol.type = 'range'; vol.min = 0; vol.max = 100; vol.value = 100; vol.step = 1;
    vol.setAttribute('aria-label', 'volume');
    var fs = el('button', 'fs', 'fullscreen');
    fs.type = 'button';
    [pp, seek, time, mute, vol, fs].forEach(function (c) { bar.appendChild(c); });

    box.appendChild(stage);
    box.appendChild(bar);

    var p = new Vimeo.Player(iframe);
    var duration = 0, muted = true;

    var note = el('div', 'note');
    stage.appendChild(note);
    function say(msg) { note.textContent = msg; note.style.display = 'flex'; }
    var started = false;
    p.on('error', function (e) {
      say('vimeo says: ' + (e && (e.name || e.message) ? (e.name || '') + ' ' + (e.message || '') : 'error') + ' — open the video link to check its embed privacy settings');
    });
    p.on('playing', function () { started = true; note.style.display = 'none'; });
    setTimeout(function () {
      if (!started && !reduceMotion) say('the video has not started. in vimeo, set this video to be embeddable on this domain (settings → privacy → where can this be embedded), then reload');
    }, 8000);

    // size the player to the film's own shape so fullscreen can sit it on black, with no empty space inside Vimeo's frame
    Promise.all([p.getVideoWidth(), p.getVideoHeight()]).then(function (d) {
      if (d[0] && d[1]) box.style.setProperty('--ar', (d[0] / d[1]).toFixed(4));
      box.classList.remove('sizing');
    }).catch(noop);

    p.getDuration().then(function (d) { duration = d; time.textContent = '0:00 / ' + fmt(d); }).catch(noop);
    p.ready().then(function () {
      if (!reduceMotion) p.play().catch(noop);
    });

    p.on('timeupdate', function (e) {
      duration = e.duration || duration;
      seek.value = Math.round((e.percent || 0) * 1000);
      time.textContent = fmt(e.seconds) + ' / ' + fmt(duration);
    });
    p.on('play', function () { pp.textContent = 'pause'; });
    p.on('pause', function () { pp.textContent = 'play'; });
    p.on('ended', function () { pp.textContent = 'play'; });

    function toggle() {
      p.getPaused().then(function (paused) { return paused ? p.play() : p.pause(); }).catch(noop);
    }
    pp.addEventListener('click', toggle);
    stage.addEventListener('click', toggle);

    seek.addEventListener('input', function () {
      if (!duration) return;
      var t = duration * seek.value / 1000;
      time.textContent = fmt(t) + ' / ' + fmt(duration);
      p.setCurrentTime(t).catch(noop);
    });

    function showSound() { mute.textContent = muted ? 'sound off' : 'sound on'; }
    mute.addEventListener('click', function () {
      muted = !muted;
      p.setMuted(muted).catch(noop);
      if (!muted) {
        if (+vol.value === 0) vol.value = 100;
        p.setVolume(vol.value / 100).catch(noop);
      }
      showSound();
    });
    vol.addEventListener('input', function () {
      var level = vol.value / 100;
      p.setVolume(level).catch(noop);
      muted = level === 0;
      p.setMuted(muted).catch(noop);
      showSound();
    });

    /* fullscreen: real fullscreen when the browser allows it,
       otherwise (sandboxed previews, iPhone) a full-window version of the same player */
    var pseudo = false;
    function isFull() {
      return pseudo || (document.fullscreenElement || document.webkitFullscreenElement) === box;
    }
    function fsLabel() { fs.textContent = isFull() ? 'exit fullscreen' : 'fullscreen'; }
    function setPseudo(on) {
      pseudo = on;
      box.classList.toggle('pseudo-fs', on);
      if (typeof wake === 'function') wake();
      document.documentElement.classList.toggle('no-scroll', on);
      fsLabel();
    }
    function enterFull() {
      var req = box.requestFullscreen || box.webkitRequestFullscreen;
      if (!req) { setPseudo(true); return; }
      try {
        var r = req.call(box);
        if (r && r.catch) r.catch(function () { setPseudo(true); });
      } catch (e) { setPseudo(true); }
    }
    function exitFull() {
      if (pseudo) { setPseudo(false); return; }
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) { var r = ex.call(document); if (r && r.catch) r.catch(noop); }
    }
    var idleTimer = null;
    function wake() {
      box.classList.remove('idle');
      clearTimeout(idleTimer);
      if (isFull()) idleTimer = setTimeout(function () { box.classList.add('idle'); }, 2500);
    }
    ['mousemove', 'touchstart', 'keydown', 'click'].forEach(function (ev) { box.addEventListener(ev, wake); });
    function fsChange() { fsLabel(); wake(); }
    fs.addEventListener('click', function () { if (isFull()) exitFull(); else enterFull(); setTimeout(wake, 50); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pseudo) setPseudo(false); });
    document.addEventListener('fullscreenchange', fsChange);
    document.addEventListener('webkitfullscreenchange', fsChange);
  }

  /* ---------- thumbnails on the motion picture page ----------
     For each project, in this order:
       1. covers/<name>.gif   a short, mushy animated GIF. It is just an image, so it appears as fast as any picture
                              and nothing else needs to load. This is the fast path.
       2. covers/<name>.jpg   a still image, then the film fades in over it (covers/<name>.mp4 loop if there is one,
                              otherwise Vimeo's player), started two at a time
       3. Vimeo's own thumbnail as the still, if there is no jpg either                                          */
  /* Set to true to let covers without a gif or mp4 load Vimeo's player in the background.
     It works, but loading eleven players is slow and visible, so it is off. */
  var VIMEO_COVER_PLAYERS = false;
  var queue = [], running = 0, MAX = 2;
  function pump() {
    while (running < MAX && queue.length) {
      running++;
      queue.shift()(function () { running--; pump(); });
    }
  }

  function slugOf(card) {
    var m = /projects\/([^\/]+)\.html/.exec(card.getAttribute('href') || '');
    return m && m[1];
  }

  function tryImage(src, ok, fail) {
    var im = new Image();
    im.onload = function () { ok(im); };
    im.onerror = function () { if (fail) fail(); };
    im.src = src;
  }

  function buildPreview(card) {
    var url = card.getAttribute('data-preview');
    var v = parse(url);
    var cover = card.querySelector('.cover');
    var slug = card.getAttribute('data-cover') || slugOf(card);
    if (!v || !cover || !slug) return;

    function show(im) {
      im.alt = '';
      im.style.opacity = '0';
      im.style.transition = 'opacity .35s';
      cover.insertBefore(im, cover.firstChild);
      requestAnimationFrame(function () { requestAnimationFrame(function () { im.style.opacity = '1'; }); });
    }

    function vimeoPoster() {
      var key = 'vimeo-poster-' + v.id;
      try { var hit = localStorage.getItem(key); if (hit) { tryImage(hit, show); return; } } catch (e) {}
      if (!window.fetch) return;
      fetch('https://vimeo.com/api/oembed.json?width=1280&url=' + encodeURIComponent(url))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.thumbnail_url) return;
          try { localStorage.setItem(key, d.thumbnail_url); } catch (e) {}
          tryImage(d.thumbnail_url, show);
        }).catch(noop);
    }

    function startFilm() {
      if (reduceMotion) return;

      function start(done) {
        var finished = false;
        function finish() { if (!finished) { finished = true; done(); } }
        setTimeout(finish, 3000);

        function vimeoPreview() {
          var f = document.createElement('iframe');
          f.className = 'preview';
          f.tabIndex = -1;
          f.setAttribute('aria-hidden', 'true');
          f.allow = 'autoplay';
          f.src = embed(v, ['muted=1', 'loop=1', 'autoplay=1']);
          cover.appendChild(f);
          var p = new Vimeo.Player(f);
          function reveal() { f.classList.add('on'); card.classList.add('has-preview'); finish(); }
          p.on('playing', reveal);
          p.on('timeupdate', function (e) { if (e.seconds > 0) reveal(); });
          p.on('error', function (e) { if (window.console) console.warn('vimeo preview error', e); finish(); });
          p.ready().then(function () { p.setMuted(true).catch(noop); p.play().catch(noop); });
          if (card.getAttribute('data-fit') === 'cover') {
            Promise.all([p.getVideoWidth(), p.getVideoHeight()]).then(function (d) {
              if (!d[0] || !d[1]) return;
              var ar = d[0] / d[1], R = 16 / 9;
              f.style.inset = 'auto';
              f.style.left = '50%';
              f.style.top = '50%';
              f.style.width = (Math.max(1, ar / R) * 100) + '%';
              f.style.height = (Math.max(1, R / ar) * 100) + '%';
              f.style.transform = 'translate(-50%, -50%)';
            }).catch(noop);
          }
        }

        var vid = document.createElement('video');
        vid.className = 'preview';
        vid.muted = true; vid.loop = true; vid.autoplay = true; vid.playsInline = true;
        vid.setAttribute('playsinline', ''); vid.setAttribute('aria-hidden', 'true');
        vid.preload = 'auto';
        vid.addEventListener('playing', function () { vid.classList.add('on'); card.classList.add('has-preview'); finish(); });
        vid.addEventListener('error', function () {
          vid.remove();
          if (VIMEO_COVER_PLAYERS && window.Vimeo) vimeoPreview(); else finish();
        });
        vid.src = 'covers/' + slug + '.mp4';
        cover.appendChild(vid);
        var pr = vid.play(); if (pr && pr.catch) pr.catch(noop);
      }

      function enqueue() { queue.push(start); pump(); }
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); enqueue(); }
        }, { rootMargin: '150px' });
        io.observe(card);
      } else { enqueue(); }
    }

    function stillThenFilm() {
      tryImage('covers/' + slug + '.jpg', show, vimeoPoster);
      startFilm();
    }

    // visitors who asked for reduced motion get a still, never an animated GIF
    if (reduceMotion) { tryImage('covers/' + slug + '.jpg', show, vimeoPoster); return; }
    tryImage('covers/' + slug + '.gif', show, stillThenFilm);   // gif found: nothing else is loaded
  }

  document.querySelectorAll('.player[data-vimeo]').forEach(buildPlayer);
  document.querySelectorAll('.project[data-preview]').forEach(buildPreview);
})();
