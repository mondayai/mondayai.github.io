(function () {
  if (window.YT_REELS && window.YT_REELS.refresh) {
    window.YT_REELS.refresh();
    return;
  }

  const API = {};
  window.YT_REELS = API;

  /* ================================
       Config
    =================================== */
  const IFRAME_SEL = ".yt-embed iframe";

  const AUTO_ADVANCE_FEED = false; // Close auto-advance in feed
  const AUTO_ADVANCE_MODAL = true;
  const WRAP_AT_END = true;

  const SWIPE_MIN_DIST = 80;
  const SWIPE_MIN_VEL = 0.35;
  const VERTICAL_BIAS = 1.2;
  const SCROLL_TO_NEXT_MS = 450;

  const DEBUG = false;
  const log = (...a) => {
    if (DEBUG) console.log("[YT_REELS]", ...a);
  };

  /* ================================
       State
    =================================== */
  const players = new Map();
  const desired = new Map();
  let apiReady = !!(window.YT && window.YT.Player);
  let listenersBound = false;

  let modalWantsPlay = false;
  let lastGestureTs = 0;
  const GESTURE_GRACE_MS = 3000;

  let ytApiRequested = apiReady;
  function requestYTApi() {
    if (ytApiRequested) return;
    ytApiRequested = true;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.defer = true;
    document.head.appendChild(tag);
  }
  window.addEventListener(
    "pointerdown",
    () => {
      requestYTApi();
      lastGestureTs = Date.now();
    },
    { once: true }
  );

  // iOS visible viewport var
  function setViewportVar() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty("--yt-vh", vh + "px");
  }
  setViewportVar();
  window.addEventListener("resize", setViewportVar);
  window.addEventListener("orientationchange", setViewportVar);

  // Scroll lock for modal
  let scrollLocked = false,
    savedScrollY = 0,
    touchBlocker = null;

  function lockScroll() {
    // ❌ Do not lock scroll on tablet / desktop
    if (window.innerWidth >= 768) {
      document.documentElement.classList.remove("yt-modal-open");
      return;
    }

    if (scrollLocked) return;
    scrollLocked = true;

    savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.documentElement.classList.add("yt-modal-open");

    touchBlocker = (e) => {
      if (!e.target.closest(".yt-modal__inner")) e.preventDefault();
    };
    document.addEventListener("touchmove", touchBlocker, { passive: false });
  }

  function unlockScroll() {
    if (!scrollLocked) return;
    scrollLocked = false;

    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    document.body.style.overflow = "";
    document.documentElement.style.overscrollBehavior = "";
    document.documentElement.classList.remove("yt-modal-open");

    document.removeEventListener("touchmove", touchBlocker, { passive: false });
    touchBlocker = null;

    window.scrollTo(0, savedScrollY);
  }

  // Modal state + playlist
  let modalEl = null,
    modalPlayer = null,
    modalGestures = null;
  let prevBtn = null,
    nextBtn = null;
  let playlist = [];
  const idToIndex = new Map();
  let modalIndex = -1;

  function rebuildPlaylist() {
    playlist = [];
    idToIndex.clear();
    document.querySelectorAll(IFRAME_SEL).forEach((iframe) => {
      const vid = getVideoId(iframe);
      const wrap = iframe.closest(".yt-embed");
      if (vid && wrap) {
        if (!iframe.id)
          iframe.id = "ytp-" + Math.random().toString(36).slice(2);
        playlist.push({ id: iframe.id, vid, wrap, iframe });
        idToIndex.set(iframe.id, playlist.length - 1);
      }
    });
  }

  /* ================================
       YouTube API ready
    =================================== */
  const prevCb = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = function () {
    try {
      prevCb && prevCb();
    } catch (_) {}
    apiReady = true;
  };

  /* ================================
       Init / Refresh
    =================================== */
  function initAll() {
    document.querySelectorAll(IFRAME_SEL).forEach((iframe) => {
      if (iframe.dataset.ytrInit) return;
      iframe.dataset.ytrInit = "1";

      const wrap = iframe.closest(".yt-embed");
      if (wrap && getComputedStyle(wrap).position === "static")
        wrap.style.position = "relative";
      if (wrap) {
        wrap.style.pointerEvents = "auto";
        wrap.style.touchAction = "auto";
      }

      // Allow autoplay + fullscreen + picture-in-picture inside iframe
      iframe.setAttribute("allowfullscreen", "");

      let allow = iframe.getAttribute("allow") || "";
      const needed = ["autoplay", "fullscreen", "picture-in-picture"];
      const current = allow
        .split(/[;,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      needed.forEach((p) => {
        if (!current.includes(p)) current.push(p);
      });
      iframe.setAttribute("allow", current.join("; "));

      if (!iframe.id) iframe.id = "ytp-" + Math.random().toString(36).slice(2);

      ensureThumb(iframe);

      // Click = open modal
      if (wrap) {
        wrap.addEventListener(
          "click",
          (e) => {
            if (e.target.closest('a,button,[role="button"]')) return;
            lastGestureTs = Date.now();
            ensureIframeSrc(iframe);
            const vid = getVideoId(iframe);
            if (!vid) return;

            rebuildPlaylist();
            modalIndex = indexOfVid(vid);

            let startAt = 0;
            try {
              const p = players.get(iframe.id);
              startAt = Math.floor(p?.getCurrentTime?.() || 0);
            } catch (_) {}

            openModalAtIndex(modalIndex >= 0 ? modalIndex : 0, startAt);
          },
          { passive: true }
        );
      }
    });

    rebuildPlaylist();

    if (!listenersBound) {
      listenersBound = true;

      const onScrollOrResize = throttle(() => {
        resizeModalPlayer();
        setViewportVar();
        updateAutoplayForVisibleCards();
      }, 120);

      window.addEventListener("scroll", onScrollOrResize, { passive: true });
      window.addEventListener("resize", onScrollOrResize);

      document.addEventListener("visibilitychange", () => {
        if (document.hidden) pauseAllExcept(null);
      });

      const mo = new MutationObserver(() => {
        initAll();
        updateAutoplayForVisibleCards();
      });
      mo.observe(document.body, { childList: true, subtree: true });

      document.addEventListener("keydown", (e) => {
        if (!modalEl || !modalEl.classList.contains("is-open")) return;
        lastGestureTs = Date.now();
        if (e.key === "Escape") closeModal();
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          playModalNext();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          playModalPrev();
        } else if (e.key === " ") {
          e.preventDefault();
          toggleModalPlayback(true);
        }
      });
    }

    setTimeout(updateAutoplayForVisibleCards, 120);
  }

  /* ================================
       Lazy iframe src + attach player
    =================================== */
  function extractYtId(input) {
    if (!input) return null;
    if (/^[a-zA-Z0-9_-]{6,}$/.test(input)) return input;
    const m =
      input.match(/[?&]v=([a-zA-Z0-9_-]{6,})/) ||
      input.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/) ||
      input.match(/\/embed\/([a-zA-Z0-9_-]{6,})/);
    return m ? m[1] : null;
  }
  function getOrigin() {
    if (window.location.protocol === "file:") return "*";
    return window.location.origin === "null" ? "*" : window.location.origin;
  }

  function buildEmbedUrlFromId(id) {
    const origin = getOrigin();
    const qs = new URLSearchParams({
      autoplay: "1",
      mute: "1",
      controls: "0",
      modestbranding: "1",
      rel: "0",
      iv_load_policy: "3",
      playsinline: "1",
      enablejsapi: "1",
      origin: origin,
    });
    return `https://www.youtube.com/embed/${id}?${qs.toString()}`;
  }

  function ensureIframeSrc(iframe) {
    if (iframe.src) return;
    const dyid = iframe.getAttribute("data-ytid");
    const dyurl = iframe.getAttribute("data-yturl");
    let id = extractYtId(dyurl || dyid);
    if (!id) {
      const ds = iframe.getAttribute("data-src");
      if (ds) id = extractYtId(ds);
    }
    if (!id) return;
    iframe.src = buildEmbedUrlFromId(id);
  }

  function ensurePlayerAndPlay(iframe) {
    if (!iframe) return;
    ensureIframeSrc(iframe);
    if (!apiReady) requestYTApi();

    const attach = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(attach, 20);
        return;
      }
      const id = iframe.id;
      const wrapper = iframe.closest(".yt-embed");
      if (!players.has(id)) {
        try {
          const p = new YT.Player(id, {
            videoId:
              extractYtId(iframe.src) || extractYtId(iframe.dataset.ytid),
            playerVars: {
              autoplay: 1,
              mute: 1,
              controls: 0,
              rel: 0,
              modestbranding: 1,
              iv_load_policy: 3,
              playsinline: 1,
              enablejsapi: 1,
              origin: getOrigin(),
            },
            events: {
              onReady: (e) => {
                try {
                  e.target.mute();
                  e.target.playVideo();
                } catch (_) {}
                desired.delete(id);
              },
              onStateChange: (e) => {
                if (!wrapper || !p) return;
                if (e.data === YT.PlayerState.PLAYING) {
                  wrapper.classList.add("is-playing");
                } else if (e.data === YT.PlayerState.ENDED) {
                  try {
                    p.seekTo(0);
                    p.playVideo();
                  } catch (_) {}
                } else if (e.data === YT.PlayerState.PAUSED) {
                  wrapper.classList.remove("is-playing");
                }
              },
            },
          });
          players.set(id, p);
        } catch (e) {
          console.error("YT Player init error:", e);
        }
      } else {
        try {
          const p = players.get(id);
          if (p && p.playVideo) {
            p.mute();
            p.playVideo();
          }
        } catch (_) {}
      }
    };
    attach();
  }

  /* ================================
       Feed next/prev (future use)
    =================================== */
  function playNextInFeed(currentId) {
    if (!AUTO_ADVANCE_FEED) return;
    rebuildPlaylist();
    const idx = idToIndex.get(currentId);
    if (idx == null) return;
    let nextIdx = idx + 1;
    if (nextIdx >= playlist.length) {
      if (!WRAP_AT_END) return;
      nextIdx = 0;
    }
    const next = playlist[nextIdx];
    try {
      next.wrap.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    } catch (_) {}
    setTimeout(() => {
      ensurePlayerAndPlay(next.iframe);
    }, SCROLL_TO_NEXT_MS);
  }

  /* ================================
       Modal / Lightbox
    =================================== */
  function ensureModal() {
    if (modalEl) return;
    modalEl = document.createElement("div");
    modalEl.className = "yt-modal";
    modalEl.innerHTML = `
      <div class="yt-modal__inner">
        <button class="yt-modal__close" type="button" aria-label="Close video">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M6 6L18 18M6 18L18 6" />
          </svg>
        </button>
        <div class="yt-modal__nav" aria-hidden="true">
          <button class="yt-modal__btn yt-modal__btn--prev" type="button" aria-label="Previous video">
            <svg viewBox="0 0 24 24"><path d="M15.5 5.5 9 12l6.5 6.5-1.4 1.4L6.2 12l7.9-7.9z"/></svg>
          </button>
          <button class="yt-modal__btn yt-modal__btn--next" type="button" aria-label="Next video">
            <svg viewBox="0 0 24 24"><path d="M8.5 5.5 15 12l-6.5 6.5 1.4 1.4L17.8 12 9.9 4.1z"/></svg>
          </button>
        </div>
        <div class="yt-modal__gestures" aria-hidden="true"></div>
        <div id="yt-reels-modal-player" class="yt-modal__frame"></div>
      </div>`;
    document.body.appendChild(modalEl);

    modalGestures = modalEl.querySelector(".yt-modal__gestures");
    prevBtn = modalEl.querySelector(".yt-modal__btn--prev");
    nextBtn = modalEl.querySelector(".yt-modal__btn--next");

    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) closeModal();
    });
    modalEl
      .querySelector(".yt-modal__close")
      .addEventListener("click", closeModal);

    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      lastGestureTs = Date.now();
      playModalPrev();
    });
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      lastGestureTs = Date.now();
      playModalNext();
    });

    attachSwipe(modalGestures, {
      onTap: () => {
        lastGestureTs = Date.now();
        toggleModalPlayback(true);
      },
      onSwipeUp: () => {
        lastGestureTs = Date.now();
        playModalNext();
      },
      onSwipeDown: () => {
        lastGestureTs = Date.now();
        playModalPrev();
      },
      blockVertical: true,
    });

    modalGestures.addEventListener(
      "click",
      () => {
        forceUnmuteIfAllowed();
      },
      { passive: true }
    );
  }

  function openModalAtIndex(idx, startSeconds) {
    ensureModal();
    rebuildPlaylist();
    if (idx < 0 || idx >= playlist.length) return;

    if (!apiReady) requestYTApi();

    modalIndex = idx;
    modalEl.classList.add("is-open");
    lockScroll();

    const vid = playlist[modalIndex].vid;
    modalWantsPlay = true;

    const startModal = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(startModal, 20);
        return;
      }
      if (modalPlayer) {
        try {
          modalPlayer.loadVideoById({
            videoId: vid,
            startSeconds: startSeconds || 0,
          });
          modalPlayer.mute();
          modalPlayer.playVideo();
          tryForceUnmuteWithGesture();
          resizeModalPlayer();
        } catch (_) {}
      } else {
        modalPlayer = new YT.Player("yt-reels-modal-player", {
          videoId: vid,
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3,
            playsinline: 1,
            enablejsapi: 1,
            origin: getOrigin(),
          },
          events: {
            onReady: (e) => {
              try {
                e.target.mute();
                if (modalWantsPlay) e.target.playVideo();
              } catch (_) {}
              tryForceUnmuteWithGesture();
              setTimeout(tryForceUnmuteWithGesture, 120);
              resizeModalPlayer();
            },
            onStateChange: (e) => {
              if (AUTO_ADVANCE_MODAL && e.data === YT.PlayerState.ENDED)
                playModalNext();
            },
          },
        });
      }
    };
    startModal();
  }

  function playModalNext() {
    rebuildPlaylist();
    if (modalIndex < 0) return;
    let nextIdx = modalIndex + 1;
    if (nextIdx >= playlist.length) {
      if (!WRAP_AT_END) {
        closeModal();
        return;
      }
      nextIdx = 0;
    }
    modalIndex = nextIdx;
    const nextVid = playlist[modalIndex].vid;
    try {
      modalWantsPlay = true;
      modalPlayer.loadVideoById({ videoId: nextVid, startSeconds: 0 });
      modalPlayer.mute();
      modalPlayer.playVideo();
      tryForceUnmuteWithGesture();
      resizeModalPlayer();
    } catch (_) {}
  }

  function playModalPrev() {
    rebuildPlaylist();
    if (modalIndex < 0) return;
    let prevIdx = modalIndex - 1;
    if (prevIdx < 0) {
      if (!WRAP_AT_END) {
        closeModal();
        return;
      }
      prevIdx = playlist.length - 1;
    }
    modalIndex = prevIdx;
    const prevVid = playlist[modalIndex].vid;
    try {
      modalWantsPlay = true;
      modalPlayer.loadVideoById({ videoId: prevVid, startSeconds: 0 });
      modalPlayer.mute();
      modalPlayer.playVideo();
      tryForceUnmuteWithGesture();
      resizeModalPlayer();
    } catch (_) {}
  }

  function closeModal() {
    if (!modalEl || !modalEl.classList.contains("is-open")) return;
    modalEl.classList.remove("is-open");
    modalWantsPlay = false;
    try {
      modalPlayer && modalPlayer.stopVideo && modalPlayer.stopVideo();
    } catch (_) {}
    unlockScroll();
  }

  function toggleModalPlayback(isGesture) {
    if (!modalPlayer || !modalPlayer.getPlayerState) return;
    if (isGesture) lastGestureTs = Date.now();
    try {
      const s = modalPlayer.getPlayerState();
      if (s === YT.PlayerState.PLAYING) {
        modalPlayer.pauseVideo();
        modalWantsPlay = false;
      } else {
        modalPlayer.playVideo();
        modalWantsPlay = true;
        tryForceUnmuteWithGesture();
      }
    } catch (_) {}
  }

  function resizeModalPlayer() {
    try {
      modalPlayer && modalPlayer.setSize(window.innerWidth, window.innerHeight);
    } catch (_) {}
  }

  function tryForceUnmuteWithGesture() {
    if (!modalPlayer) return;
    const within = Date.now() - lastGestureTs <= GESTURE_GRACE_MS;
    if (!within) return;
    forceUnmuteIfAllowed();
  }
  function forceUnmuteIfAllowed() {
    try {
      modalPlayer.unMute();
      modalPlayer.setVolume(100);
      const s = modalPlayer.getPlayerState && modalPlayer.getPlayerState();
      if (s !== 1) modalPlayer.playVideo();
    } catch (_) {}
  }

  /* ================================
       Autoplay: Cards visible in viewport
    =================================== */
  function updateAutoplayForVisibleCards() {
    const cards = Array.from(document.querySelectorAll(".yt-embed"));
    if (!cards.length) return;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;

    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const iframe = card.querySelector("iframe");
      if (!iframe) return;

      if (rect.bottom <= 0 || rect.top >= vh) {
        safePause(iframe.id);
        return;
      }

      const visible = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
      const ratio = visible / Math.max(rect.height, 1);

      if (ratio > 0.2) {
        ensurePlayerAndPlay(iframe);
      } else {
        safePause(iframe.id);
      }
    });
  }

  /* ================================
       Helpers
    =================================== */
  function ensureThumb(iframe) {
    const wrap = iframe.closest(".yt-embed");
    if (!wrap || wrap.querySelector(".yt-thumb")) return;
    const vid = getVideoId(iframe);
    if (!vid) return;
    const img = document.createElement("img");
    img.className = "yt-thumb";
    img.loading = "lazy";
    img.decoding = "async";
    img.src = `https://img.youtube.com/vi/${vid}/maxresdefault.jpg`;
    img.onerror = function () {
      this.onerror = null;
      this.src = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
    };
    wrap.appendChild(img);
  }
  function getVideoId(iframe) {
    const byUrl = iframe.getAttribute("data-yturl");
    const byId = iframe.getAttribute("data-ytid");
    let id = extractYtId(byUrl || byId);
    if (id) return id;
    const ds = iframe.getAttribute("data-src");
    if (ds) {
      id = extractYtId(ds);
      if (id) return id;
    }
    if (iframe.src) {
      id = extractYtId(iframe.src);
      if (id) return id;
    }
    return null;
  }
  function indexOfVid(vid) {
    for (let i = 0; i < playlist.length; i++) {
      if (playlist[i].vid === vid) return i;
    }
    return -1;
  }
  function safePlay(id) {
    const p = players.get(id);
    const iframe = document.getElementById(id);
    const wrap = iframe && iframe.closest(".yt-embed");
    if (!iframe) return;
    if (!p) {
      ensurePlayerAndPlay(iframe);
      return;
    }
    try {
      p.mute();
      p.playVideo();
      wrap && wrap.classList.add("is-playing");
    } catch (_) {
      desired.set(id, "play");
    }
  }
  function safePause(id) {
    const p = players.get(id);
    const iframe = document.getElementById(id);
    const wrap = iframe && iframe.closest(".yt-embed");
    if (!p) {
      desired.set(id, "pause");
      return;
    }
    try {
      p.pauseVideo();
      wrap && wrap.classList.remove("is-playing");
    } catch (_) {
      desired.set(id, "pause");
    }
  }
  function pauseAllExcept(activeId) {
    players.forEach((pp, pid) => {
      if (activeId === null || pid !== activeId) {
        try {
          pp.pauseVideo();
        } catch (_) {}
        const iframe = document.getElementById(pid);
        const wrap = iframe && iframe.closest(".yt-embed");
        if (wrap) wrap.classList.remove("is-playing");
      }
    });
  }
  function throttle(fn, wait) {
    let last = 0,
      t;
    return function () {
      const now = Date.now();
      const remain = wait - (now - last);
      if (remain <= 0) {
        last = now;
        fn();
      } else {
        clearTimeout(t);
        t = setTimeout(() => {
          last = Date.now();
          fn();
        }, remain);
      }
    };
  }

  // ================= Swipe detector (modal gestures) =================
  function attachSwipe(el, opts) {
    if (!el) return;
    let sx = 0,
      sy = 0,
      st = 0,
      tracking = false;
    const onStart = (e) => {
      const p = e.touches ? e.touches[0] : e;
      sx = p.clientX;
      sy = p.clientY;
      st = Date.now();
      tracking = true;
    };
    const onMove = (e) => {
      if (!tracking) return;
      e.preventDefault();
    };
    const onEnd = (e) => {
      if (!tracking) return;
      tracking = false;
      const p =
        (e.changedTouches && e.changedTouches[0]) ||
        (e.touches && e.touches[0]) ||
        e;
      const dx = (p.clientX || 0) - sx;
      const dy = (p.clientY || 0) - sy;
      const dt = Date.now() - st;
      const vel = Math.sqrt(dx * dx + dy * dy) / Math.max(1, dt);

      if (Math.abs(dy) > Math.abs(dx) * VERTICAL_BIAS) {
        if (Math.abs(dy) >= SWIPE_MIN_DIST && vel >= SWIPE_MIN_VEL) {
          if (dy < 0 && opts.onSwipeUp) opts.onSwipeUp();
          else if (dy > 0 && opts.onSwipeDown) opts.onSwipeDown();
          return;
        }
      } else {
        if (Math.abs(dx) >= SWIPE_MIN_DIST && vel >= SWIPE_MIN_VEL) {
          if (dx < 0 && opts.onSwipeLeft)
            opts.onSwipeLeft && opts.onSwipeLeft();
          else if (dx > 0 && opts.onSwipeRight)
            opts.onSwipeRight && opts.onSwipeRight();
          return;
        }
      }
      opts.onTap && opts.onTap();
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("mousedown", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("mousemove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("mouseup", onEnd, { passive: false });
    el.addEventListener("touchcancel", () => {
      tracking = false;
    });
    el.addEventListener("mouseleave", () => {
      tracking = false;
    });
  }

  // Public refresh
  API.refresh = function () {
    initAll();
  };

  // Updated initAll boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
