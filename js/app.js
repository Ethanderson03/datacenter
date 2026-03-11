/**
 * HPC GPU Superpod Datacenter Infrastructure - Interactive Educational Walkthrough
 * Pure vanilla JavaScript - No frameworks
 *
 * Handles all interactivity: navigation, animations, tabs, modals, quizzes,
 * diagrams, search, theming, accessibility, and progress tracking.
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // =========================================================================
  // CONFIGURATION
  // =========================================================================

  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'physical-infra', label: 'Physical Infrastructure' },
    { id: 'racks-hardware', label: 'Racks & Hardware' },
    { id: 'networking-physical', label: 'Physical Networking' },
    { id: 'network-architecture', label: 'Network Architecture' },
    { id: 'virtualization', label: 'Virtualization' },
    { id: 'virtual-networking', label: 'Virtual Networking' },
    { id: 'storage', label: 'Storage' },
    { id: 'orchestration', label: 'Orchestration' },
    { id: 'monitoring-sre', label: 'Monitoring & SRE' },
    { id: 'systems-diagram', label: 'Systems Diagram' },
  ];

  const STORAGE_KEYS = {
    theme: 'hpc-walkthrough-theme',
    visited: 'hpc-walkthrough-visited',
    quizResults: 'hpc-walkthrough-quiz',
  };

  const SCROLL_OFFSET = 80; // pixels offset for scroll-to-section
  const ANIMATION_THRESHOLD = 0.15; // intersection ratio to trigger animation

  // =========================================================================
  // STATE
  // =========================================================================

  const state = {
    currentSection: null,
    sidebarOpen: false,
    activeModal: null,
    theme: 'light',
    visitedSections: new Set(),
    quizResults: {},
    searchActive: false,
    searchHighlights: [],
  };

  // =========================================================================
  // UTILITY FUNCTIONS
  // =========================================================================

  /**
   * Debounce function to limit execution rate.
   */
  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * Throttle function to limit execution rate with guaranteed trailing call.
   */
  function throttle(fn, limit) {
    let inThrottle = false;
    let lastArgs = null;
    let lastThis = null;

    return function (...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => {
          inThrottle = false;
          if (lastArgs) {
            fn.apply(lastThis, lastArgs);
            lastArgs = null;
            lastThis = null;
          }
        }, limit);
      } else {
        lastArgs = args;
        lastThis = this;
      }
    };
  }

  /**
   * Safely query an element, returning null if not found.
   */
  function qs(selector, parent = document) {
    return parent.querySelector(selector);
  }

  /**
   * Safely query all matching elements, returning an array.
   */
  function qsa(selector, parent = document) {
    return Array.from(parent.querySelectorAll(selector));
  }

  /**
   * Create an element with optional attributes and children.
   */
  function createElement(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') {
        el.className = value;
      } else if (key === 'textContent') {
        el.textContent = value;
      } else if (key === 'innerHTML') {
        el.innerHTML = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else {
        el.setAttribute(key, value);
      }
    }
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    }
    return el;
  }

  /**
   * Load state from localStorage.
   */
  function loadPersistedState() {
    try {
      const theme = localStorage.getItem(STORAGE_KEYS.theme);
      if (theme === 'light' || theme === 'dark') {
        state.theme = theme;
      }

      const visited = localStorage.getItem(STORAGE_KEYS.visited);
      if (visited) {
        const parsed = JSON.parse(visited);
        if (Array.isArray(parsed)) {
          parsed.forEach((id) => state.visitedSections.add(id));
        }
      }

      const quiz = localStorage.getItem(STORAGE_KEYS.quizResults);
      if (quiz) {
        const parsed = JSON.parse(quiz);
        if (parsed && typeof parsed === 'object') {
          state.quizResults = parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load persisted state:', e);
    }
  }

  /**
   * Save specific state key to localStorage.
   */
  function persistState(key) {
    try {
      switch (key) {
        case 'theme':
          localStorage.setItem(STORAGE_KEYS.theme, state.theme);
          break;
        case 'visited':
          localStorage.setItem(
            STORAGE_KEYS.visited,
            JSON.stringify(Array.from(state.visitedSections))
          );
          break;
        case 'quiz':
          localStorage.setItem(
            STORAGE_KEYS.quizResults,
            JSON.stringify(state.quizResults)
          );
          break;
      }
    } catch (e) {
      console.warn('Failed to persist state:', e);
    }
  }

  /**
   * Get current section index from SECTIONS config.
   */
  function getSectionIndex(id) {
    return SECTIONS.findIndex((s) => s.id === id);
  }

  /**
   * Copy text to clipboard with fallback for older browsers.
   */
  async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        // fall through to fallback
      }
    }
    // Fallback for non-HTTPS or older browsers
    const textarea = createElement('textarea', {
      style: {
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        opacity: '0',
      },
    });
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (e) {
      // ignore
    }
    document.body.removeChild(textarea);
    return success;
  }

  // =========================================================================
  // 1. SCROLL PROGRESS BAR
  // =========================================================================

  const progressBar = qs('#progress-bar') || qs('.progress-bar');
  const sectionSelector = '.content-section[id], section[id], .section[id]';
  const sidebarLinkSelector = '.nav-link, .sidebar-link';

  function updateProgressBar() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight =
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

    if (progressBar) {
      progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }
  }

  // =========================================================================
  // 2. SIDEBAR NAVIGATION
  // =========================================================================

  const sidebar = qs('#sidebar') || qs('.sidebar');
  const sidebarNav = qs('#sidebar-nav') || qs('.sidebar-nav');
  const sidebarOverlay = qs('#sidebar-overlay') || qs('.sidebar-overlay');

  /**
   * Build sidebar navigation links if a nav container exists but is empty.
   */
  function buildSidebarNav() {
    if (!sidebarNav) return;

    // Only build if the nav is empty (not pre-rendered in HTML)
    if (sidebarNav.children.length > 0) return;

    SECTIONS.forEach((section, index) => {
      const link = createElement('a', {
        href: `#${section.id}`,
        className: 'nav-link sidebar-link',
        'data-section': section.id,
      });

      const number = createElement('span', {
        className: 'sidebar-link-number',
        textContent: String(index + 1).padStart(2, '0'),
      });

      const label = createElement('span', {
        className: 'sidebar-link-label',
        textContent: section.label,
      });

      const badge = createElement('span', {
        className: 'sidebar-link-badge',
        title: 'Section visited',
      });

      link.appendChild(number);
      link.appendChild(label);
      link.appendChild(badge);
      sidebarNav.appendChild(link);
    });
  }

  /**
   * Highlight the active section link in the sidebar.
   */
  function updateSidebarHighlight(sectionId) {
    if (!sidebarNav) return;

    qsa(sidebarLinkSelector, sidebarNav).forEach((link) => {
      const linkSection = link.getAttribute('data-section');
      const isActive = linkSection === sectionId;
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  /**
   * Update completion badges for visited sections.
   */
  function updateVisitedBadges() {
    if (!sidebarNav) return;

    qsa(sidebarLinkSelector, sidebarNav).forEach((link) => {
      const sectionId = link.getAttribute('data-section');
      if (state.visitedSections.has(sectionId)) {
        link.classList.add('visited');
      }
    });
  }

  /**
   * Mark a section as visited.
   */
  function markSectionVisited(sectionId) {
    if (!sectionId) return;
    if (!state.visitedSections.has(sectionId)) {
      state.visitedSections.add(sectionId);
      persistState('visited');
      updateVisitedBadges();
    }
  }

  /**
   * Smooth scroll to a section by ID.
   */
  function scrollToSection(sectionId, behavior = 'smooth') {
    const target = document.getElementById(sectionId);
    if (!target) return;

    const top =
      target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;

    window.scrollTo({
      top: Math.max(0, top),
      behavior,
    });

    // Update state and mark visited
    state.currentSection = sectionId;
    updateSidebarHighlight(sectionId);
    markSectionVisited(sectionId);

    // Close mobile sidebar after navigation
    if (state.sidebarOpen) {
      closeSidebar();
    }
  }

  /**
   * Handle sidebar link clicks.
   */
  function initSidebarClicks() {
    if (!sidebarNav) return;

    sidebarNav.addEventListener('click', (e) => {
      const link = e.target.closest(sidebarLinkSelector);
      if (!link) return;

      e.preventDefault();
      const sectionId = link.getAttribute('data-section');
      if (sectionId) {
        scrollToSection(sectionId);
      }
    });
  }

  /**
   * Open sidebar (mobile).
   */
  function openSidebar() {
    state.sidebarOpen = true;
    if (sidebar) sidebar.classList.add('open');
    if (sidebarOverlay) sidebarOverlay.classList.add('visible');
    document.body.classList.add('sidebar-open');
  }

  /**
   * Close sidebar (mobile).
   */
  function closeSidebar() {
    state.sidebarOpen = false;
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('visible');
    document.body.classList.remove('sidebar-open');
  }

  /**
   * Toggle sidebar (mobile).
   */
  function toggleSidebar() {
    if (state.sidebarOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  // =========================================================================
  // 3. SECTION ANIMATIONS (Intersection Observer)
  // =========================================================================

  let sectionObserver = null;

  function initSectionAnimations() {
    const sections = qsa(sectionSelector);
    if (sections.length === 0) return;

    sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            markSectionVisited(entry.target.id);

            // Stagger child animations
            const animatedChildren = qsa(
              '.animate-in, .fade-in, .slide-in',
              entry.target
            );
            animatedChildren.forEach((child, index) => {
              child.style.transitionDelay = `${index * 0.1}s`;
              child.classList.add('visible');
            });
          }
        });
      },
      {
        rootMargin: '-10% 0px -10% 0px',
        threshold: [0, ANIMATION_THRESHOLD, 0.5],
      }
    );

    sections.forEach((section) => {
      sectionObserver.observe(section);
    });
  }

  // =========================================================================
  // ACTIVE SECTION TRACKING (for sidebar highlight on scroll)
  // =========================================================================

  let activeSectionObserver = null;

  function initActiveSectionTracking() {
    const sections = qsa(sectionSelector);
    if (sections.length === 0) return;

    activeSectionObserver = new IntersectionObserver(
      (entries) => {
        // Find the entry most in view
        let bestEntry = null;
        let bestRatio = 0;

        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestEntry = entry;
          }
        });

        if (bestEntry) {
          const sectionId = bestEntry.target.id;
          if (sectionId && sectionId !== state.currentSection) {
            state.currentSection = sectionId;
            updateSidebarHighlight(sectionId);
            markSectionVisited(sectionId);
          }
        }
      },
      {
        rootMargin: `-${SCROLL_OFFSET}px 0px -50% 0px`,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );

    sections.forEach((section) => {
      activeSectionObserver.observe(section);
    });
  }

  // =========================================================================
  // 4. TAB COMPONENTS
  // =========================================================================

  function initTabs() {
    // Find all tab groups
    const tabGroups = qsa('.tab-group, .tabs');

    tabGroups.forEach((group) => {
      const buttons = qsa('.tab-btn', group);
      const contents = qsa('.tab-content', group);

      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetTab = btn.getAttribute('data-tab');

          // Deactivate all tabs in this group
          buttons.forEach((b) => b.classList.remove('active'));
          contents.forEach((c) => {
            c.classList.remove('active');
            c.style.display = 'none';
          });

          // Activate clicked tab
          btn.classList.add('active');
          const targetContent =
            group.querySelector(`.tab-content[data-tab="${targetTab}"]`) ||
            document.getElementById(targetTab);
          if (targetContent) {
            targetContent.classList.add('active');
            targetContent.style.display = '';
          }
        });
      });

      // Initialize: show the first tab or the one marked active
      const activeBtn =
        group.querySelector('.tab-btn.active') || buttons[0];
      if (activeBtn) {
        activeBtn.click();
      }
    });

    // Also handle standalone tab buttons not within a .tab-group
    qsa('.tab-btn:not(.tab-group .tab-btn):not(.tabs .tab-btn)').forEach(
      (btn) => {
        btn.addEventListener('click', () => {
          const targetTab = btn.getAttribute('data-tab');
          const parent = btn.closest('[data-tab-group]') || btn.parentElement;

          // Deactivate siblings
          if (parent) {
            qsa('.tab-btn', parent).forEach((b) =>
              b.classList.remove('active')
            );
          }

          btn.classList.add('active');

          // Find and show target content
          const targetContent = document.querySelector(
            `.tab-content[data-tab="${targetTab}"]`
          );
          if (targetContent) {
            // Hide siblings
            const contentParent = targetContent.parentElement;
            if (contentParent) {
              qsa('.tab-content', contentParent).forEach((c) => {
                c.classList.remove('active');
                c.style.display = 'none';
              });
            }
            targetContent.classList.add('active');
            targetContent.style.display = '';
          }
        });
      }
    );
  }

  // =========================================================================
  // 5. EXPANDABLE PANELS
  // =========================================================================

  function initExpandables() {
    const expandables = qsa('.expandable');

    expandables.forEach((panel) => {
      const content =
        qs('.expandable-content', panel) || qs('.expandable-body', panel);
      panel.classList.add('expanded');

      if (content) {
        content.style.maxHeight = 'none';
        content.style.overflow = 'visible';
      }
    });
  }

  // =========================================================================
  // 6. INTERACTIVE DIAGRAMS
  // =========================================================================

  let activeTooltip = null;

  function createTooltip(text, targetEl) {
    removeTooltip();

    const tooltip = createElement('div', {
      className: 'diagram-tooltip',
      role: 'tooltip',
    });
    tooltip.innerHTML = text;

    document.body.appendChild(tooltip);

    // Position the tooltip above or below the target element
    const rect = targetEl.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let top = rect.top - tooltipRect.height - 10;
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;

    // Flip below if not enough room above
    if (top < 10) {
      top = rect.bottom + 10;
      tooltip.classList.add('tooltip-below');
    }

    // Keep within viewport horizontally
    left = Math.max(10, Math.min(left, window.innerWidth - tooltipRect.width - 10));

    tooltip.style.top = `${top + window.scrollY}px`;
    tooltip.style.left = `${left}px`;
    tooltip.classList.add('visible');

    activeTooltip = tooltip;
    return tooltip;
  }

  function removeTooltip() {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  }

  function initDiagramNodes() {
    const nodes = qsa('.diagram-node');

    nodes.forEach((node) => {
      // Hover: show tooltip
      node.addEventListener('mouseenter', () => {
        const tooltipText =
          node.getAttribute('data-tooltip') ||
          node.getAttribute('title') ||
          node.textContent.trim();

        // Remove title to prevent browser default tooltip
        if (node.hasAttribute('title')) {
          node.setAttribute('data-original-title', node.getAttribute('title'));
          node.removeAttribute('title');
        }

        node.classList.add('hovered');
        createTooltip(tooltipText, node);
      });

      node.addEventListener('mouseleave', () => {
        node.classList.remove('hovered');
        removeTooltip();

        // Restore title
        if (node.hasAttribute('data-original-title')) {
          node.setAttribute('title', node.getAttribute('data-original-title'));
          node.removeAttribute('data-original-title');
        }
      });

      // Click: open detail modal or panel
      node.addEventListener('click', () => {
        const modalId = node.getAttribute('data-modal');
        const detailId = node.getAttribute('data-detail');

        if (modalId) {
          openModal(modalId);
        } else if (detailId) {
          showDetailPanel(detailId, node);
        } else {
          // Generic detail popup with node info
          const title =
            node.getAttribute('data-title') ||
            node.getAttribute('data-tooltip') ||
            node.textContent.trim();
          const description =
            node.getAttribute('data-description') || '';

          if (title || description) {
            showInlineDetail(node, title, description);
          }
        }
      });

      // Make focusable for keyboard navigation
      if (!node.getAttribute('tabindex')) {
        node.setAttribute('tabindex', '0');
      }
      node.setAttribute('role', 'button');

      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          node.click();
        }
      });
    });

    // SVG element hover effects
    qsa('svg .interactive, svg [data-interactive]').forEach((el) => {
      el.style.cursor = 'pointer';
      el.addEventListener('mouseenter', () => {
        el.classList.add('svg-hover');
      });
      el.addEventListener('mouseleave', () => {
        el.classList.remove('svg-hover');
      });
    });
  }

  /**
   * Show a detail panel anchored near a diagram node.
   */
  function showDetailPanel(detailId, anchorNode) {
    // Close any existing detail panels
    qsa('.detail-panel.active').forEach((p) => p.classList.remove('active'));

    const panel = document.getElementById(detailId);
    if (!panel) return;

    panel.classList.add('active');

    // If the panel has a close button, wire it up
    const closeBtn = qs('.detail-panel-close, .close-btn', panel);
    if (closeBtn) {
      closeBtn.addEventListener(
        'click',
        () => {
          panel.classList.remove('active');
        },
        { once: true }
      );
    }
  }

  /**
   * Show an inline detail popup for diagram nodes without dedicated modals.
   */
  function showInlineDetail(node, title, description) {
    // Remove existing inline detail popups
    qsa('.inline-detail-popup').forEach((p) => p.remove());

    const popup = createElement(
      'div',
      { className: 'inline-detail-popup' },
      createElement('div', { className: 'inline-detail-header' },
        createElement('h4', { textContent: title }),
        createElement('button', {
          className: 'inline-detail-close',
          innerHTML: '&times;',
          'aria-label': 'Close',
          onClick: () => popup.remove(),
        })
      ),
      ...(description
        ? [createElement('div', { className: 'inline-detail-body', innerHTML: description })]
        : [])
    );

    // Position near the node
    const rect = node.getBoundingClientRect();
    popup.style.position = 'absolute';
    popup.style.top = `${rect.bottom + window.scrollY + 8}px`;
    popup.style.left = `${rect.left + window.scrollX}px`;
    popup.style.zIndex = '1000';

    document.body.appendChild(popup);

    // Auto-close on outside click
    const outsideClickHandler = (e) => {
      if (!popup.contains(e.target) && e.target !== node) {
        popup.remove();
        document.removeEventListener('click', outsideClickHandler);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', outsideClickHandler);
    }, 0);
  }

  // =========================================================================
  // 7. MODAL SYSTEM
  // =========================================================================

  function openModal(modalId) {
    const modal =
      document.getElementById(modalId) ||
      qs(`[data-modal-id="${modalId}"]`);
    if (!modal) return;

    // Close any open modal first
    if (state.activeModal) {
      closeModal(state.activeModal);
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    state.activeModal = modal;

    // Focus the modal or first focusable element within it
    const firstFocusable = qs(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      modal
    );
    if (firstFocusable) {
      firstFocusable.focus();
    } else {
      modal.setAttribute('tabindex', '-1');
      modal.focus();
    }

    // Trap focus within modal
    modal._trapFocusHandler = (e) => {
      if (e.key !== 'Tab') return;

      const focusableEls = qsa(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        modal
      );
      if (focusableEls.length === 0) return;

      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    modal.addEventListener('keydown', modal._trapFocusHandler);
  }

  function closeModal(modal) {
    if (!modal) return;

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');

    if (modal._trapFocusHandler) {
      modal.removeEventListener('keydown', modal._trapFocusHandler);
      delete modal._trapFocusHandler;
    }

    if (state.activeModal === modal) {
      state.activeModal = null;
    }

    // Return focus to the trigger element if possible
    const triggerId = modal.getAttribute('data-trigger-id');
    if (triggerId) {
      const trigger = document.getElementById(triggerId);
      if (trigger) trigger.focus();
    }
  }

  function closeActiveModal() {
    if (state.activeModal) {
      closeModal(state.activeModal);
    }
  }

  function initModals() {
    // Open modal triggers
    qsa('[data-modal]').forEach((trigger) => {
      // Skip diagram-node elements (handled separately)
      if (trigger.classList.contains('diagram-node')) return;

      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        const modalId = trigger.getAttribute('data-modal');
        openModal(modalId);
      });
    });

    // Close buttons within modals
    qsa('.modal-close, .modal .close-btn, [data-modal-close]').forEach(
      (btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const modal = btn.closest('.modal');
          if (modal) {
            closeModal(modal);
          } else {
            closeActiveModal();
          }
        });
      }
    );

    // Backdrop close
    qsa('.modal').forEach((modal) => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
          closeModal(modal);
        }
      });
    });
  }

  // =========================================================================
  // 8. CODE COPY BUTTONS
  // =========================================================================

  function initCodeCopyButtons() {
    const codeBlocks = qsa('pre code');

    codeBlocks.forEach((codeEl) => {
      const pre = codeEl.parentElement;
      if (!pre || pre.querySelector('.code-copy-btn')) return;

      // Ensure the pre has position for absolute button placement
      pre.style.position = 'relative';

      const copyBtn = createElement('button', {
        className: 'code-copy-btn',
        title: 'Copy to clipboard',
        'aria-label': 'Copy code to clipboard',
        type: 'button',
        innerHTML: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M11 3H3.5C2.67 3 2 3.67 2 4.5V11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg><span class="copy-label">Copy</span>`,
      });

      copyBtn.addEventListener('click', async () => {
        const text = codeEl.textContent;
        const success = await copyToClipboard(text);

        if (success) {
          copyBtn.classList.add('copied');
          const label = qs('.copy-label', copyBtn);
          if (label) label.textContent = 'Copied!';

          setTimeout(() => {
            copyBtn.classList.remove('copied');
            if (label) label.textContent = 'Copy';
          }, 2000);
        } else {
          copyBtn.classList.add('copy-failed');
          const label = qs('.copy-label', copyBtn);
          if (label) label.textContent = 'Failed';

          setTimeout(() => {
            copyBtn.classList.remove('copy-failed');
            if (label) label.textContent = 'Copy';
          }, 2000);
        }
      });

      pre.appendChild(copyBtn);
    });
  }

  // =========================================================================
  // 9. KNOWLEDGE CHECK / QUIZ SYSTEM
  // =========================================================================

  function initQuizzes() {
    const questions = qsa('.quiz-question');

    questions.forEach((question) => {
      const questionId =
        question.getAttribute('data-question-id') ||
        question.id ||
        `quiz-${Math.random().toString(36).slice(2, 9)}`;

      question.setAttribute('data-question-id', questionId);

      const answers = qsa('.quiz-answer', question);
      const feedback =
        qs('.quiz-feedback', question) ||
        (() => {
          const fb = createElement('div', { className: 'quiz-feedback' });
          question.appendChild(fb);
          return fb;
        })();

      // Restore previous answer if any
      if (state.quizResults[questionId] !== undefined) {
        restoreQuizState(question, questionId, answers, feedback);
      }

      answers.forEach((answer) => {
        answer.setAttribute('role', 'button');
        answer.setAttribute('tabindex', '0');

        const clickHandler = () => {
          // Prevent re-answering
          if (question.classList.contains('answered')) return;

          const isCorrect = answer.getAttribute('data-correct') === 'true';

          // Mark question as answered
          question.classList.add('answered');

          // Highlight the selected answer
          answer.classList.add('selected');

          if (isCorrect) {
            answer.classList.add('correct');
            feedback.textContent =
              answer.getAttribute('data-feedback-correct') ||
              question.getAttribute('data-feedback-correct') ||
              'Correct! Well done.';
            feedback.className = 'quiz-feedback correct visible';
          } else {
            answer.classList.add('incorrect');
            feedback.textContent =
              answer.getAttribute('data-feedback-incorrect') ||
              question.getAttribute('data-feedback-incorrect') ||
              'Not quite. Try reviewing this section again.';
            feedback.className = 'quiz-feedback incorrect visible';

            // Highlight the correct answer
            answers.forEach((a) => {
              if (a.getAttribute('data-correct') === 'true') {
                a.classList.add('correct', 'reveal');
              }
            });
          }

          // Disable all answers
          answers.forEach((a) => {
            a.setAttribute('tabindex', '-1');
            a.classList.add('disabled');
          });

          // Save result
          state.quizResults[questionId] = {
            correct: isCorrect,
            selectedIndex: answers.indexOf(answer),
            timestamp: Date.now(),
          };
          persistState('quiz');

          // Update quiz score if there's a score display
          updateQuizScore();
        };

        answer.addEventListener('click', clickHandler);
        answer.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            clickHandler();
          }
        });
      });

      // Add reset button
      const resetBtn = createElement('button', {
        className: 'quiz-reset-btn',
        textContent: 'Try Again',
        type: 'button',
        style: { display: 'none' },
      });

      resetBtn.addEventListener('click', () => {
        question.classList.remove('answered');
        answers.forEach((a) => {
          a.classList.remove(
            'selected',
            'correct',
            'incorrect',
            'disabled',
            'reveal'
          );
          a.setAttribute('tabindex', '0');
        });
        feedback.className = 'quiz-feedback';
        feedback.textContent = '';
        resetBtn.style.display = 'none';

        delete state.quizResults[questionId];
        persistState('quiz');
        updateQuizScore();
      });

      question.appendChild(resetBtn);

      // Show reset button when answered
      const showResetObserver = new MutationObserver(() => {
        if (question.classList.contains('answered')) {
          resetBtn.style.display = '';
        }
      });
      showResetObserver.observe(question, {
        attributes: true,
        attributeFilter: ['class'],
      });
    });
  }

  /**
   * Restore a previously answered quiz question.
   */
  function restoreQuizState(question, questionId, answers, feedback) {
    const result = state.quizResults[questionId];
    if (!result) return;

    question.classList.add('answered');

    const selectedAnswer = answers[result.selectedIndex];
    if (!selectedAnswer) return;

    selectedAnswer.classList.add('selected');

    if (result.correct) {
      selectedAnswer.classList.add('correct');
      feedback.textContent =
        selectedAnswer.getAttribute('data-feedback-correct') ||
        question.getAttribute('data-feedback-correct') ||
        'Correct! Well done.';
      feedback.className = 'quiz-feedback correct visible';
    } else {
      selectedAnswer.classList.add('incorrect');
      feedback.textContent =
        selectedAnswer.getAttribute('data-feedback-incorrect') ||
        question.getAttribute('data-feedback-incorrect') ||
        'Not quite. Try reviewing this section again.';
      feedback.className = 'quiz-feedback incorrect visible';

      answers.forEach((a) => {
        if (a.getAttribute('data-correct') === 'true') {
          a.classList.add('correct', 'reveal');
        }
      });
    }

    answers.forEach((a) => {
      a.setAttribute('tabindex', '-1');
      a.classList.add('disabled');
    });
  }

  /**
   * Update the quiz score display if present.
   */
  function updateQuizScore() {
    const scoreDisplay = qs('.quiz-score, #quiz-score');
    if (!scoreDisplay) return;

    const totalQuestions = qsa('.quiz-question').length;
    const answered = Object.keys(state.quizResults).length;
    const correct = Object.values(state.quizResults).filter(
      (r) => r.correct
    ).length;

    scoreDisplay.textContent = `${correct}/${totalQuestions} correct (${answered}/${totalQuestions} answered)`;

    if (answered === totalQuestions) {
      scoreDisplay.classList.add('complete');
    }
  }

  // =========================================================================
  // 10. KEYBOARD NAVIGATION
  // =========================================================================

  function initKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
      // Don't handle keyboard shortcuts when typing in inputs
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight': {
          if (e.altKey || e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          navigateSection(1);
          break;
        }

        case 'ArrowUp':
        case 'ArrowLeft': {
          if (e.altKey || e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          navigateSection(-1);
          break;
        }

        case 'Escape': {
          if (state.activeModal) {
            closeActiveModal();
          } else if (state.sidebarOpen) {
            closeSidebar();
          } else if (state.searchActive) {
            closeSearch();
          }
          break;
        }

        case 'Home': {
          if (e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          scrollToSection(SECTIONS[0].id);
          break;
        }

        case 'End': {
          if (e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          scrollToSection(SECTIONS[SECTIONS.length - 1].id);
          break;
        }

        case '/': {
          // Quick search shortcut
          if (!e.ctrlKey && !e.metaKey && !state.activeModal) {
            e.preventDefault();
            openSearch();
          }
          break;
        }

        default:
          break;
      }
    });
  }

  /**
   * Navigate to the next or previous section.
   */
  function navigateSection(direction) {
    const currentIndex = getSectionIndex(state.currentSection);
    const newIndex = currentIndex + direction;

    if (newIndex >= 0 && newIndex < SECTIONS.length) {
      scrollToSection(SECTIONS[newIndex].id);
    }
  }

  // =========================================================================
  // 11. SEARCH / FILTER
  // =========================================================================

  const searchContainer = qs('#search-container') || qs('.search-container');
  const searchInput = qs('#search-input') || qs('.search-input');
  const searchResults = qs('#search-results') || qs('.search-results');
  const searchClearBtn = qs('#search-clear') || qs('.search-clear');

  function openSearch() {
    state.searchActive = true;
    if (searchContainer) {
      searchContainer.classList.add('active');
    }
    if (searchInput) {
      searchInput.focus();
    }
  }

  function closeSearch() {
    state.searchActive = false;
    if (searchContainer) {
      searchContainer.classList.remove('active');
    }
    if (searchInput) {
      searchInput.value = '';
    }
    if (searchResults) {
      searchResults.innerHTML = '';
    }
    clearSearchHighlights();
  }

  function clearSearchHighlights() {
    // Remove all search highlight marks
    qsa('mark.search-highlight').forEach((mark) => {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });
    state.searchHighlights = [];
  }

  /**
   * Perform a text search across all sections.
   */
  function performSearch(query) {
    clearSearchHighlights();

    if (!query || query.length < 2) {
      if (searchResults) searchResults.innerHTML = '';
      return;
    }

    const normalizedQuery = query.toLowerCase().trim();
    const results = [];

    const sections = qsa(sectionSelector);

    sections.forEach((section) => {
      const sectionId = section.id;
      const sectionConfig = SECTIONS.find((s) => s.id === sectionId);
      const sectionLabel = sectionConfig
        ? sectionConfig.label
        : sectionId;

      // Search within text content of the section (excluding script/style)
      const textNodes = getTextNodes(section);
      let matchCount = 0;
      const snippets = [];

      textNodes.forEach((textNode) => {
        const text = textNode.textContent;
        const lowerText = text.toLowerCase();
        let index = lowerText.indexOf(normalizedQuery);

        while (index !== -1) {
          matchCount++;

          // Extract snippet around the match
          const start = Math.max(0, index - 40);
          const end = Math.min(text.length, index + normalizedQuery.length + 40);
          const snippet = (start > 0 ? '...' : '') +
            text.slice(start, index) +
            '<mark class="search-result-highlight">' +
            text.slice(index, index + normalizedQuery.length) +
            '</mark>' +
            text.slice(index + normalizedQuery.length, end) +
            (end < text.length ? '...' : '');

          if (snippets.length < 3) {
            snippets.push(snippet);
          }

          // Highlight in the document
          highlightTextNode(textNode, index, normalizedQuery.length);

          index = lowerText.indexOf(normalizedQuery, index + normalizedQuery.length);
        }
      });

      if (matchCount > 0) {
        results.push({
          sectionId,
          sectionLabel,
          matchCount,
          snippets,
        });
      }
    });

    // Display results
    if (searchResults) {
      if (results.length === 0) {
        searchResults.innerHTML = `<div class="search-no-results">No results found for "<strong>${escapeHtml(query)}</strong>"</div>`;
      } else {
        const totalMatches = results.reduce(
          (sum, r) => sum + r.matchCount,
          0
        );
        let html = `<div class="search-summary">${totalMatches} match${totalMatches === 1 ? '' : 'es'} in ${results.length} section${results.length === 1 ? '' : 's'}</div>`;

        results.forEach((result) => {
          html += `<div class="search-result-item" data-section="${result.sectionId}">
            <div class="search-result-section">${escapeHtml(result.sectionLabel)} (${result.matchCount})</div>
            <div class="search-result-snippets">${result.snippets.join('<br>')}</div>
          </div>`;
        });

        searchResults.innerHTML = html;

        // Click to navigate to section
        qsa('.search-result-item', searchResults).forEach((item) => {
          item.addEventListener('click', () => {
            const sectionId = item.getAttribute('data-section');
            scrollToSection(sectionId);
          });
        });
      }
    }
  }

  /**
   * Get all text nodes within an element, excluding script/style.
   */
  function getTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (
            parent &&
            (parent.tagName === 'SCRIPT' ||
              parent.tagName === 'STYLE' ||
              parent.tagName === 'MARK' ||
              parent.classList.contains('search-highlight'))
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          if (node.textContent.trim().length === 0) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    return textNodes;
  }

  /**
   * Highlight a match within a text node by wrapping it in a <mark>.
   */
  function highlightTextNode(textNode, startIndex, length) {
    try {
      const range = document.createRange();
      range.setStart(textNode, startIndex);
      range.setEnd(textNode, startIndex + length);

      const mark = createElement('mark', {
        className: 'search-highlight',
      });

      range.surroundContents(mark);
      state.searchHighlights.push(mark);
    } catch (e) {
      // Range manipulation can fail if DOM has been modified
      console.warn('Could not highlight text node:', e);
    }
  }

  /**
   * Escape HTML entities for safe insertion.
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function initSearch() {
    if (searchInput) {
      searchInput.addEventListener(
        'input',
        debounce((e) => {
          performSearch(e.target.value);
        }, 300)
      );

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeSearch();
        }
      });
    }

    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        closeSearch();
      });
    }

    // Search toggle button
    const searchToggle = qs('#search-toggle') || qs('.search-toggle');
    if (searchToggle) {
      searchToggle.addEventListener('click', () => {
        if (state.searchActive) {
          closeSearch();
        } else {
          openSearch();
        }
      });
    }
  }

  // =========================================================================
  // 12. DARK / LIGHT MODE TOGGLE
  // =========================================================================

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.toggle('light-mode', theme === 'light');
    document.body.classList.toggle('dark-mode', theme === 'dark');
    persistState('theme');

    // Update toggle button state
    const toggleBtn = qs('#theme-toggle') || qs('.theme-toggle');
    if (toggleBtn) {
      toggleBtn.setAttribute(
        'aria-label',
        theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
      );
      toggleBtn.setAttribute('data-current-theme', theme);

      // Update icon within toggle
      const icon = qs('.theme-icon', toggleBtn);
      if (icon) {
        if (theme === 'dark') {
          icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
        } else {
          icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M17.39 11.39A7.5 7.5 0 018.61 2.61 7.5 7.5 0 1017.39 11.39z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        }
      }
    }
  }

  function toggleTheme() {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
  }

  function initThemeToggle() {
    const toggleBtn = qs('#theme-toggle') || qs('.theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleTheme);
    }

    // Also support system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      // Only apply system preference if user hasn't explicitly set a theme
      if (!localStorage.getItem(STORAGE_KEYS.theme)) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  // =========================================================================
  // 13. PRINT MODE
  // =========================================================================

  function initPrintMode() {
    // Clean up layout before printing
    window.addEventListener('beforeprint', () => {
      document.body.classList.add('print-mode');

      // Expand all expandable sections for printing
      qsa('.expandable').forEach((panel) => {
        panel.classList.add('expanded', 'print-expanded');
        const content = qs('.expandable-content, .expandable-body', panel);
        if (content) {
          content.style.maxHeight = 'none';
        }
      });

      // Show all tab contents for printing
      qsa('.tab-content').forEach((content) => {
        content.classList.add('print-visible');
        content.style.display = '';
      });

      // Close modals and sidebar
      closeActiveModal();
      closeSidebar();

      // Remove tooltips
      removeTooltip();
    });

    window.addEventListener('afterprint', () => {
      document.body.classList.remove('print-mode');

      // Restore expandable panels that were not originally expanded
      qsa('.expandable.print-expanded').forEach((panel) => {
        panel.classList.remove('expanded', 'print-expanded');
        const content = qs('.expandable-content, .expandable-body', panel);
        if (content) {
          content.style.maxHeight = '0';
        }
      });

      // Restore tab visibility
      qsa('.tab-content.print-visible').forEach((content) => {
        content.classList.remove('print-visible');
        if (!content.classList.contains('active')) {
          content.style.display = 'none';
        }
      });
    });

    // Print button if present
    const printBtn = qs('#print-btn') || qs('.print-btn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }
  }

  // =========================================================================
  // 14. MOBILE MENU TOGGLE
  // =========================================================================

  function initMobileMenu() {
    const hamburger =
      qs('#hamburger-menu') ||
      qs('.hamburger-menu') ||
      qs('.mobile-menu-toggle') ||
      qs('#mobile-menu-toggle');

    if (hamburger) {
      hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSidebar();
        hamburger.classList.toggle('active', state.sidebarOpen);
        hamburger.setAttribute(
          'aria-expanded',
          String(state.sidebarOpen)
        );
      });

      hamburger.setAttribute('aria-label', 'Toggle navigation menu');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.setAttribute('aria-controls', 'sidebar');
    }

    // Close sidebar when clicking overlay
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', closeSidebar);
    }

    // Close sidebar on resize to desktop
    window.addEventListener(
      'resize',
      debounce(() => {
        if (window.innerWidth > 1024 && state.sidebarOpen) {
          closeSidebar();
          if (hamburger) hamburger.classList.remove('active');
        }
      }, 150)
    );
  }

  // =========================================================================
  // 15. SYSTEMS DIAGRAM INTERACTIVITY
  // =========================================================================

  function initSystemsDiagram() {
    const diagramSection = document.getElementById('systems-diagram');
    if (!diagramSection) return;

    // Handle clicks on individual system components within the diagram
    const components = qsa(
      '.diagram-component, .system-component, [data-component]',
      diagramSection
    );

    components.forEach((component) => {
      component.setAttribute('tabindex', '0');
      component.setAttribute('role', 'button');

      component.addEventListener('click', () => {
        const componentId =
          component.getAttribute('data-component') ||
          component.getAttribute('data-detail') ||
          component.id;
        const componentName =
          component.getAttribute('data-name') ||
          component.getAttribute('data-title') ||
          component.textContent.trim();

        // Deselect all other components
        components.forEach((c) => c.classList.remove('selected'));
        component.classList.add('selected');

        // Show the detail panel for this component
        const detailPanel =
          document.getElementById(`detail-${componentId}`) ||
          qs(`.component-detail[data-component="${componentId}"]`, diagramSection);

        // Hide all detail panels in the diagram section
        qsa('.component-detail', diagramSection).forEach((panel) => {
          panel.classList.remove('active');
        });

        if (detailPanel) {
          detailPanel.classList.add('active');
        } else {
          // Create a temporary detail display if no dedicated panel exists
          showComponentDetail(diagramSection, componentId, componentName, component);
        }
      });

      component.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          component.click();
        }
      });

      // Hover effect for connections
      component.addEventListener('mouseenter', () => {
        component.classList.add('highlight');

        // Highlight connected paths/lines
        const connections = component.getAttribute('data-connections');
        if (connections) {
          connections.split(',').forEach((connId) => {
            const connEl = document.getElementById(connId.trim());
            if (connEl) connEl.classList.add('connection-highlight');
          });
        }
      });

      component.addEventListener('mouseleave', () => {
        component.classList.remove('highlight');

        // Remove connection highlights
        qsa('.connection-highlight').forEach((el) =>
          el.classList.remove('connection-highlight')
        );
      });
    });
  }

  /**
   * Show a detail panel for a system component.
   */
  function showComponentDetail(container, componentId, componentName, anchorEl) {
    // Remove any existing temporary detail panels
    const existing = qs('.temp-component-detail', container);
    if (existing) existing.remove();

    // Component descriptions for the systems diagram
    const componentInfo = {
      'gpu-nodes': {
        title: 'GPU Compute Nodes',
        description:
          'NVIDIA DGX or HGX systems with 8x H100/H200 GPUs per node. NVLink and NVSwitch provide 900 GB/s GPU-to-GPU bandwidth within a node. Each node contains dual CPUs for orchestration and PCIe Gen5 connectivity.',
        specs: ['8x H100/H200 SXM GPUs', '2x Intel Xeon or AMD EPYC CPUs', '2TB DDR5 RAM', '4x ConnectX-7 400GbE NICs'],
      },
      'spine-switches': {
        title: 'Spine Network Switches',
        description:
          'High-radix spine switches forming the core of the fat-tree or Clos network topology. Each spine connects to every leaf switch, providing non-blocking east-west bandwidth for GPU-to-GPU communication.',
        specs: ['Quantum-2 InfiniBand NDR 400G', '64-port line-rate switching', 'Adaptive routing support', 'In-network computing (SHARP)'],
      },
      'leaf-switches': {
        title: 'Leaf / Top-of-Rack Switches',
        description:
          'Leaf switches connect compute nodes to the network fabric. Each leaf aggregates traffic from a rack of GPU servers and uplinks to multiple spine switches for redundancy and bandwidth.',
        specs: ['32-64 downlink ports (400GbE)', '16-32 uplink ports to spine', 'ECMP load balancing', 'PFC/ECN for RoCE or lossless fabric'],
      },
      'storage-tier': {
        title: 'Storage Subsystem',
        description:
          'Parallel file system providing high-throughput data access for training datasets, checkpoints, and model artifacts. Combines NVMe flash for hot data with HDD for capacity.',
        specs: ['Lustre / GPFS / WekaFS', '100+ GB/s aggregate throughput', 'NVMe-oF for low-latency access', 'Multi-PB capacity'],
      },
      'management-network': {
        title: 'Management & Control Plane',
        description:
          'Out-of-band management network for BMC/IPMI access, provisioning (PXE), monitoring telemetry, and orchestration control traffic. Physically separate from the high-speed data plane.',
        specs: ['1/10GbE management NICs', 'BMC/IPMI/Redfish endpoints', 'DHCP/PXE/TFTP services', 'Prometheus/Grafana telemetry'],
      },
      'orchestration': {
        title: 'Orchestration & Scheduling',
        description:
          'Kubernetes with GPU-aware scheduling, or Slurm/PBS for HPC workload management. Handles job queuing, multi-node GPU allocation, and topology-aware placement for optimal communication.',
        specs: ['Kubernetes + NVIDIA GPU Operator', 'Slurm with Pyxis/Enroot', 'Topology-aware scheduling', 'Multi-instance GPU (MIG) support'],
      },
      'cooling': {
        title: 'Cooling Infrastructure',
        description:
          'Direct liquid cooling (DLC) for GPU nodes dissipating 10+ kW per server. Rear-door heat exchangers or in-row cooling units. Facility water loop connected to cooling towers or chillers.',
        specs: ['Direct-to-chip liquid cooling', '40-70 kW per rack', 'CDU (Coolant Distribution Unit)', 'Hot/cold aisle containment'],
      },
      'power': {
        title: 'Power Distribution',
        description:
          'High-density power delivery supporting 40-70 kW per rack. Redundant power feeds (2N or 2N+1), UPS systems, and PDUs with per-outlet monitoring for power management and efficiency tracking.',
        specs: ['480V 3-phase distribution', 'Redundant (A+B) power feeds', 'UPS with 10-15 min runtime', 'Intelligent PDUs with monitoring'],
      },
    };

    const info = componentInfo[componentId] || {
      title: componentName,
      description: `Details for ${componentName}. Click other components to explore the system architecture.`,
      specs: [],
    };

    const detailPanel = createElement('div', {
      className: 'temp-component-detail component-detail active',
    });

    let specsHtml = '';
    if (info.specs && info.specs.length > 0) {
      specsHtml = `<ul class="component-specs">${info.specs.map((s) => `<li>${s}</li>`).join('')}</ul>`;
    }

    detailPanel.innerHTML = `
      <div class="component-detail-header">
        <h4>${escapeHtml(info.title)}</h4>
        <button class="component-detail-close" aria-label="Close">&times;</button>
      </div>
      <div class="component-detail-body">
        <p>${info.description}</p>
        ${specsHtml}
      </div>
    `;

    container.appendChild(detailPanel);

    // Close handler
    qs('.component-detail-close', detailPanel).addEventListener('click', () => {
      detailPanel.classList.remove('active');
      setTimeout(() => detailPanel.remove(), 300);
      // Deselect component
      const selected = qs('.diagram-component.selected, .system-component.selected, [data-component].selected', container);
      if (selected) selected.classList.remove('selected');
    });
  }

  // =========================================================================
  // 16. SMOOTH SECTION TRANSITIONS
  // =========================================================================

  function initSmoothTransitions() {
    // Handle all anchor links that point to sections
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;

      const targetId = link.getAttribute('href').slice(1);
      if (!targetId) return;

      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;

      e.preventDefault();
      scrollToSection(targetId);
    });

    // CSS scroll-behavior as fallback
    document.documentElement.style.scrollBehavior = 'smooth';
  }

  // =========================================================================
  // 17. LOCAL STORAGE - VISITED SECTIONS & COMPLETION BADGES
  // =========================================================================

  function initCompletionTracking() {
    updateVisitedBadges();
    updateCompletionDisplay();
  }

  /**
   * Update the overall completion progress display.
   */
  function updateCompletionDisplay() {
    const completionDisplay =
      qs('#completion-display') || qs('.completion-display');
    if (!completionDisplay) return;

    const total = SECTIONS.length;
    const visited = state.visitedSections.size;
    const percentage = Math.round((visited / total) * 100);

    completionDisplay.innerHTML = `
      <div class="completion-bar">
        <div class="completion-fill" style="width: ${percentage}%"></div>
      </div>
      <span class="completion-text">${visited}/${total} sections visited (${percentage}%)</span>
    `;

    if (visited === total) {
      completionDisplay.classList.add('all-complete');
    }
  }

  // =========================================================================
  // SCROLL EVENT HANDLER (combined for performance)
  // =========================================================================

  function initScrollHandler() {
    const onScroll = throttle(() => {
      updateProgressBar();
    }, 16); // ~60fps

    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // =========================================================================
  // ACCESSIBILITY ENHANCEMENTS
  // =========================================================================

  function initAccessibility() {
    // Skip to main content link
    const skipLink = qs('.skip-link, #skip-to-content');
    if (skipLink) {
      skipLink.addEventListener('click', (e) => {
        e.preventDefault();
        const main = qs('main, #main-content, .main-content');
        if (main) {
          main.setAttribute('tabindex', '-1');
          main.focus();
        }
      });
    }

    // Reduce motion preference
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduceMotion.matches) {
      document.documentElement.classList.add('reduce-motion');
      document.documentElement.style.scrollBehavior = 'auto';
    }

    reduceMotion.addEventListener('change', (e) => {
      document.documentElement.classList.toggle('reduce-motion', e.matches);
      document.documentElement.style.scrollBehavior = e.matches
        ? 'auto'
        : 'smooth';
    });

    // Announce section changes to screen readers
    let announcer = qs('#sr-announcer');
    if (!announcer) {
      announcer = createElement('div', {
        id: 'sr-announcer',
        'aria-live': 'polite',
        'aria-atomic': 'true',
        className: 'sr-only',
        style: {
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: '0',
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: '0',
        },
      });
      document.body.appendChild(announcer);
    }

    // Observe section changes and announce
    const originalUpdateHighlight = updateSidebarHighlight;
    window._sidebarHighlight = function (sectionId) {
      originalUpdateHighlight(sectionId);
      const section = SECTIONS.find((s) => s.id === sectionId);
      if (section) {
        announcer.textContent = `Now viewing: ${section.label}`;
      }
    };
  }

  // =========================================================================
  // BACK TO TOP BUTTON
  // =========================================================================

  function initBackToTop() {
    const backToTop = qs('#back-to-top') || qs('.back-to-top');
    if (!backToTop) return;

    const toggleVisibility = throttle(() => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      backToTop.classList.toggle('visible', scrollY > 500);
    }, 100);

    window.addEventListener('scroll', toggleVisibility, { passive: true });

    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // =========================================================================
  // TABLE OF CONTENTS PROGRESS
  // =========================================================================

  function initTocProgress() {
    const tocItems = qsa('.toc-item, .toc-link');
    if (tocItems.length === 0) return;

    tocItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId =
          item.getAttribute('data-section') ||
          item.getAttribute('href')?.slice(1);
        if (targetId) {
          scrollToSection(targetId);
        }
      });
    });
  }

  // =========================================================================
  // IMAGE LAZY LOADING FALLBACK
  // =========================================================================

  function initLazyLoading() {
    if ('loading' in HTMLImageElement.prototype) {
      // Browser supports native lazy loading
      qsa('img[data-src]').forEach((img) => {
        img.src = img.getAttribute('data-src');
        img.loading = 'lazy';
      });
    } else {
      // Intersection Observer fallback
      const imageObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const img = entry.target;
              if (img.getAttribute('data-src')) {
                img.src = img.getAttribute('data-src');
              }
              if (img.getAttribute('data-srcset')) {
                img.srcset = img.getAttribute('data-srcset');
              }
              imageObserver.unobserve(img);
            }
          });
        },
        { rootMargin: '200px' }
      );

      qsa('img[data-src]').forEach((img) => imageObserver.observe(img));
    }
  }

  // =========================================================================
  // NOTIFICATION / TOAST SYSTEM
  // =========================================================================

  let toastContainer = null;

  function showToast(message, type = 'info', duration = 3000) {
    if (!toastContainer) {
      toastContainer = createElement('div', {
        className: 'toast-container',
        'aria-live': 'polite',
      });
      document.body.appendChild(toastContainer);
    }

    const toast = createElement('div', {
      className: `toast toast-${type}`,
    });
    toast.innerHTML = `
      <span class="toast-message">${escapeHtml(message)}</span>
      <button class="toast-close" aria-label="Dismiss">&times;</button>
    `;

    toastContainer.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    const dismiss = () => {
      toast.classList.remove('visible');
      toast.classList.add('exiting');
      setTimeout(() => toast.remove(), 300);
    };

    qs('.toast-close', toast).addEventListener('click', dismiss);

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }

    return { dismiss };
  }

  // Expose toast globally for use in HTML event handlers
  window.showToast = showToast;

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  function init() {
    // Load persisted state first
    loadPersistedState();

    // Apply theme (default light)
    applyTheme(state.theme);

    // Build dynamic sidebar nav if needed
    buildSidebarNav();

    // Initialize all modules
    initScrollHandler();
    initSidebarClicks();
    initMobileMenu();
    initSectionAnimations();
    initActiveSectionTracking();
    initTabs();
    initExpandables();
    initDiagramNodes();
    initModals();
    initCodeCopyButtons();
    initQuizzes();
    initKeyboardNavigation();
    initSearch();
    initThemeToggle();
    initPrintMode();
    initSystemsDiagram();
    initSmoothTransitions();
    initCompletionTracking();
    initAccessibility();
    initBackToTop();
    initTocProgress();
    initLazyLoading();

    // Initial progress bar update
    updateProgressBar();

    // Initial quiz score update
    updateQuizScore();

    // Mark the initial visible section
    const hash = window.location.hash.slice(1);
    if (hash && document.getElementById(hash)) {
      state.currentSection = hash;
      updateSidebarHighlight(hash);
      markSectionVisited(hash);
      // Scroll to hash section after a short delay to allow layout
      setTimeout(() => scrollToSection(hash, 'auto'), 100);
    } else {
      // Mark first visible section
      const firstSection = qs(sectionSelector);
      if (firstSection) {
        state.currentSection = firstSection.id;
        updateSidebarHighlight(firstSection.id);
        markSectionVisited(firstSection.id);
      }
    }

    // Update visited completion display
    updateCompletionDisplay();

    console.log('HPC GPU Superpod Walkthrough initialized');
  }

  // Run initialization
  init();
});
