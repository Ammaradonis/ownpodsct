const storagePrefix = 'archive-signal:player:';
let activeWrapper = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getCurrentHashTime() {
  const hash = window.location.hash.match(/^#t=(\d+)$/);
  return hash ? Number(hash[1]) : null;
}

function initialisePlayer(wrapper) {
  const media = wrapper.querySelector('[data-media]');
  if (!media) {
    return;
  }

  const episodeId = wrapper.dataset.episodeId;
  const title = wrapper.dataset.title || document.title;
  const mirrorUrl = wrapper.dataset.mirrorUrl;
  const storageKey = `${storagePrefix}${episodeId}`;
  const speedSelect = wrapper.querySelector('[data-speed]');
  const shuffleButton = wrapper.querySelector('[data-shuffle-button]');
  const chapterButtons = wrapper.querySelectorAll('[data-chapter]');
  const copyTimestampButton = wrapper.querySelector('[data-copy-timestamp]');
  const trackButtons = Array.from(wrapper.querySelectorAll('[data-track-button]'));
  const repeatTrackButtons = Array.from(wrapper.querySelectorAll('[data-repeat-track-button]'));
  const repeatCurrentTrack = wrapper.dataset.repeatCurrentTrack === 'true';
  const enableShuffle = wrapper.dataset.enableShuffle === 'true';
  let currentTrackIndex = 0;
  let repeatingTrackIndex = null;
  let shuffledTrackIndices = new Set([0]);
  let shuffleEnabled = false;

  const pickNextShuffledTrackIndex = () => {
    const allTrackIndices = trackButtons.map((_, index) => index);
    let availableIndices = allTrackIndices.filter(
      (index) => index !== currentTrackIndex && !shuffledTrackIndices.has(index),
    );

    if (availableIndices.length === 0) {
      shuffledTrackIndices = new Set([currentTrackIndex]);
      availableIndices = allTrackIndices.filter((index) => index !== currentTrackIndex);
    }

    return availableIndices[Math.floor(Math.random() * availableIndices.length)];
  };

  const applyTrack = (nextTrackIndex, nextUrl, nextDuration) => {
    if (!nextUrl || nextTrackIndex === currentTrackIndex) {
      return;
    }

    const currentRate = media.playbackRate;
    currentTrackIndex = nextTrackIndex;
    shuffledTrackIndices.add(nextTrackIndex);
    wrapper.dataset.duration = String(nextDuration || 0);
    media.dataset.duration = String(nextDuration || 0);
    media.src = nextUrl;
    media.dataset.fallbackApplied = 'false';
    media.load();
    media.playbackRate = currentRate;
    media.addEventListener(
      'loadedmetadata',
      () => {
        media.playbackRate = currentRate;
      },
      { once: true },
    );
    lastSavedSecond = -1;
    setActiveTrackButton();
    media.play().catch(() => {});
  };

  const storageKeyForTrack = () => `${storageKey}:track:${currentTrackIndex}`;
  const setActiveTrackButton = () => {
    trackButtons.forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.trackIndex || 0) === currentTrackIndex);
    });
    repeatTrackButtons.forEach((button) => {
      const trackIndex = Number(button.dataset.trackIndex || 0);
      const isCurrent = trackIndex === currentTrackIndex;
      const isRepeating = trackIndex === repeatingTrackIndex;
      button.classList.toggle('is-visible', repeatCurrentTrack && isCurrent);
      button.disabled = !isCurrent;
      button.dataset.repeatEnabled = isRepeating ? 'true' : 'false';
      button.textContent = isRepeating ? 'Repeating' : 'Repeat';
      button.setAttribute('aria-hidden', String(!repeatCurrentTrack || !isCurrent));
      button.setAttribute(
        'aria-label',
        isRepeating
          ? 'Disable automatic repeat for the current track'
          : 'Enable automatic repeat for the current track at the current playback speed',
      );
    });
  };

  activeWrapper = activeWrapper || wrapper;

  const restorePosition = () => {
    const hashTime = getCurrentHashTime();
    const savedTime = Number(localStorage.getItem(storageKeyForTrack()) || '0');
    const duration = Number(media.duration || wrapper.dataset.duration || 0);
    const nextTime = hashTime ?? savedTime;

    if (nextTime > 0 && Number.isFinite(duration)) {
      media.currentTime = clamp(nextTime, 0, duration - 1 || nextTime);
    }
  };

  media.addEventListener('loadedmetadata', restorePosition, { once: true });

  let lastSavedSecond = -1;
  media.addEventListener('timeupdate', () => {
    const second = Math.floor(media.currentTime);
    if (second !== lastSavedSecond && second % 5 === 0) {
      localStorage.setItem(storageKeyForTrack(), String(second));
      lastSavedSecond = second;
    }
  });

  media.addEventListener('ended', () => {
    if (repeatCurrentTrack && repeatingTrackIndex === currentTrackIndex) {
      media.currentTime = 0;
      media.play().catch(() => {});
      return;
    }

    if (enableShuffle && shuffleEnabled && trackButtons.length > 1) {
      const nextTrackIndex = pickNextShuffledTrackIndex();
      const nextTrackButton = trackButtons[nextTrackIndex];
      const nextUrl = nextTrackButton?.dataset.trackUrl;
      const nextDuration = Number(nextTrackButton?.dataset.trackDuration || 0);
      applyTrack(nextTrackIndex, nextUrl, nextDuration);
      return;
    }

    localStorage.removeItem(storageKeyForTrack());
  });

  wrapper.querySelectorAll('[data-skip]').forEach((button) => {
    button.addEventListener('click', () => {
      const delta = Number(button.dataset.skip || 0);
      media.currentTime = clamp(media.currentTime + delta, 0, media.duration || media.currentTime + delta);
    });
  });

  if (speedSelect) {
    speedSelect.addEventListener('change', () => {
      media.playbackRate = Number(speedSelect.value || 1);
    });
  }

  chapterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      media.currentTime = Number(button.dataset.chapter || 0);
      media.play().catch(() => {});
    });
  });

  copyTimestampButton?.addEventListener('click', async () => {
    const url = `${window.location.origin}${window.location.pathname}#t=${Math.floor(media.currentTime)}`;
    await navigator.clipboard.writeText(url);
  });

  trackButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextTrackIndex = Number(button.dataset.trackIndex || 0);
      const nextUrl = button.dataset.trackUrl;
      const nextDuration = Number(button.dataset.trackDuration || 0);
      applyTrack(nextTrackIndex, nextUrl, nextDuration);
    });
  });

  repeatTrackButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetTrackIndex = Number(button.dataset.trackIndex || 0);
      if (targetTrackIndex !== currentTrackIndex) {
        return;
      }

      repeatingTrackIndex = repeatingTrackIndex === targetTrackIndex ? null : targetTrackIndex;
      setActiveTrackButton();
    });
  });

  shuffleButton?.addEventListener('click', () => {
    if (!enableShuffle || trackButtons.length < 2) {
      return;
    }
    shuffleEnabled = true;
    const nextTrackIndex = pickNextShuffledTrackIndex();
    const nextTrackButton = trackButtons[nextTrackIndex];
    const nextUrl = nextTrackButton?.dataset.trackUrl;
    const nextDuration = Number(nextTrackButton?.dataset.trackDuration || 0);

    repeatingTrackIndex = null;
    applyTrack(nextTrackIndex, nextUrl, nextDuration);
  });

  setActiveTrackButton();

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: document.title.replace(/\s+\|.+$/, ''),
    });

    navigator.mediaSession.setActionHandler('seekbackward', () => {
      media.currentTime = clamp(media.currentTime - 15, 0, media.duration || media.currentTime);
    });

    navigator.mediaSession.setActionHandler('seekforward', () => {
      media.currentTime = clamp(media.currentTime + 30, 0, media.duration || media.currentTime + 30);
    });

    navigator.mediaSession.setActionHandler('pause', () => media.pause());
    navigator.mediaSession.setActionHandler('play', () => media.play());
  }

  if (mirrorUrl) {
    media.addEventListener(
      'error',
      () => {
        if (media.dataset.fallbackApplied === 'true') {
          return;
        }
        media.dataset.fallbackApplied = 'true';
        media.src = mirrorUrl;
        media.load();
      },
      { once: true },
    );
  }

  wrapper.addEventListener('pointerenter', () => {
    activeWrapper = wrapper;
  });
  wrapper.addEventListener('focusin', () => {
    activeWrapper = wrapper;
  });
}

document.querySelectorAll('[data-player]').forEach(initialisePlayer);

window.addEventListener('hashchange', () => {
  const wrapper = activeWrapper ?? document.querySelector('[data-player]');
  const media = wrapper?.querySelector('[data-media]');
  const hashTime = getCurrentHashTime();

  if (media && hashTime !== null) {
    media.currentTime = hashTime;
  }
});

window.addEventListener('keydown', (event) => {
  const activeElement = document.activeElement;
  if (activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName)) {
    return;
  }

  const wrapper = activeWrapper ?? document.querySelector('[data-player]');
  const media = wrapper?.querySelector('[data-media]');
  if (!media) {
    return;
  }

  if (event.code === 'Space') {
    event.preventDefault();
    if (media.paused) {
      media.play().catch(() => {});
    } else {
      media.pause();
    }
  }

  if (event.code === 'KeyJ') {
    media.currentTime = clamp(media.currentTime - 15, 0, media.duration || media.currentTime);
  }

  if (event.code === 'KeyL') {
    media.currentTime = clamp(media.currentTime + 30, 0, media.duration || media.currentTime + 30);
  }

  if (event.code === 'KeyM') {
    media.muted = !media.muted;
  }
});
