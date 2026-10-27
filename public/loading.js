;(() => {
  const fetchOriginal = window.fetch
  let requestsPendentes = 0

  const estilo = document.createElement('style')
  estilo.textContent = `
    #request-loading-indicator {
      position: fixed;
      left: 50%;
      bottom: 20px;
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border: 1px solid var(--color-border, #dde2ea);
      border-radius: 999px;
      background: var(--color-surface, #fff);
      color: var(--color-ink, #101828);
      box-shadow: 0 8px 24px rgba(16, 24, 40, 0.18);
      font: 500 0.85rem var(--font-body, sans-serif);
      opacity: 0;
      visibility: hidden;
      transform: translate(-50%, 8px);
      transition:
        opacity 0.2s ease,
        transform 0.2s ease,
        visibility 0.2s ease;
      pointer-events: none;
    }

    #request-loading-indicator.is-visible {
      opacity: 1;
      visibility: visible;
      transform: translate(-50%, 0);
    }

    #request-loading-indicator .request-loading-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid var(--color-accent-soft, #dde6f5);
      border-top-color: var(--color-accent, #2b4c8c);
      border-radius: 50%;
      animation: request-loading-spin 0.8s linear infinite;
    }

    @keyframes request-loading-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      #request-loading-indicator,
      #request-loading-indicator .request-loading-spinner {
        transition: none;
        animation: none;
      }
    }
  `
  document.head.appendChild(estilo)

  const indicador = document.createElement('div')
  indicador.id = 'request-loading-indicator'
  indicador.setAttribute('role', 'status')
  indicador.setAttribute('aria-live', 'polite')

  const spinner = document.createElement('span')
  spinner.className = 'request-loading-spinner'
  spinner.setAttribute('aria-hidden', 'true')

  const mensagem = document.createElement('span')
  mensagem.textContent = 'Aguardando resposta do servidor...'

  indicador.append(spinner, mensagem)
  document.body.appendChild(indicador)

  function atualizarIndicador() {
    indicador.classList.toggle('is-visible', requestsPendentes > 0)
  }

  window.fetch = async (...argumentos) => {
    const recurso = argumentos[0]
    const urlRecurso =
      recurso instanceof Request
        ? recurso.url
        : recurso instanceof URL
          ? recurso.href
          : recurso
    const mesmaOrigem =
      new URL(urlRecurso, window.location.href).origin ===
      window.location.origin

    if (!mesmaOrigem) {
      return fetchOriginal.apply(window, argumentos)
    }

    requestsPendentes += 1
    atualizarIndicador()

    try {
      return await fetchOriginal.apply(window, argumentos)
    } finally {
      requestsPendentes -= 1
      atualizarIndicador()
    }
  }
})()
