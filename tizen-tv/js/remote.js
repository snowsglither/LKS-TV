/**
 * Samsung remote / keyboard focus management.
 * Keys: Arrow*, Enter, Escape/Back (10009), Play/Pause media keys when present.
 */

const BACK_KEYS = new Set([8, 27, 10009, 461]); // Backspace, Esc, Tizen Back, some remotes
const ENTER_KEYS = new Set([13, 32]); // Enter, Space

let backHandler = null;

export function setBackHandler(fn) {
  backHandler = fn;
}

export function focusableSelector() {
  return '[data-focus]:not([disabled]):not([aria-hidden="true"])';
}

export function allFocusables(root = document) {
  return [...root.querySelectorAll(focusableSelector())].filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

export function focusFirst(root = document) {
  const list = allFocusables(root);
  if (list[0]) list[0].focus();
}

export function moveFocus(direction) {
  const list = allFocusables();
  if (!list.length) return;
  const active = document.activeElement;
  let idx = list.indexOf(active);
  if (idx < 0) {
    list[0].focus();
    return;
  }
  const colHint = Number(active.getAttribute('data-focus-col') || 0);
  const rowHint = Number(active.getAttribute('data-focus-row') || 0);

  if (direction === 'left' || direction === 'right') {
    const delta = direction === 'right' ? 1 : -1;
    const next = list[idx + delta] || list[idx];
    next.focus();
    return;
  }

  // Up/down: prefer same column when grid hints exist
  if (direction === 'up' || direction === 'down') {
    const wantRow = rowHint + (direction === 'down' ? 1 : -1);
    const sameCol = list.find(
      (el) =>
        Number(el.getAttribute('data-focus-row') || -1) === wantRow &&
        Number(el.getAttribute('data-focus-col') || -1) === colHint
    );
    if (sameCol) {
      sameCol.focus();
      return;
    }
    const delta = direction === 'down' ? 1 : -1;
    const next = list[idx + delta] || list[idx];
    next.focus();
  }
}

export function installRemoteHandlers() {
  document.addEventListener(
    'keydown',
    (e) => {
      const key = e.keyCode || e.which;
      if (BACK_KEYS.has(key) || e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        backHandler?.();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveFocus('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveFocus('right');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus('up');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus('down');
      } else if (ENTER_KEYS.has(key) || e.key === 'Enter') {
        const el = document.activeElement;
        if (el && el.hasAttribute('data-focus') && typeof el.click === 'function') {
          e.preventDefault();
          el.click();
        }
      }
    },
    true
  );

  // Tizen register keys when available
  try {
    if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
      const keys = [
        'MediaPlayPause',
        'MediaPlay',
        'MediaPause',
        'MediaStop',
        'ColorF0Red',
        'ColorF1Green'
      ];
      tizen.tvinputdevice.registerKeyBatch(keys);
    }
  } catch {
    /* emulator / browser */
  }
}
