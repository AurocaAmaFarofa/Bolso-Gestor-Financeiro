const recuperarSenhaForm = document.querySelector('#recuperar-senha-form')

if (recuperarSenhaForm) {
  const emailInput = recuperarSenhaForm.querySelector('#email')
  const enviarEmailButton =
    recuperarSenhaForm.querySelector('#btn-enviar-email')
  const mensagemFormulario = recuperarSenhaForm.querySelector('#form-message')

  recuperarSenhaForm.addEventListener('submit', async (evento) => {
    evento.preventDefault() // coloquei por que tava dando erro
    mensagemFormulario.textContent = ''
    mensagemFormulario.className = 'form-message'

    if (!recuperarSenhaForm.reportValidity()) {
      return
    }

    enviarEmailButton.disabled = true
    enviarEmailButton.textContent = 'Enviando...'

    try {
      const resposta = await fetch('/senhas/esqueci-senha', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailInput.value.trim() }),
      })

      let dados
      try {
        dados = await resposta.json()
      } catch {
        if (!resposta.ok) {
          throw new Error(
            `Não foi possível enviar o e-mail (erro ${resposta.status}).`,
          )
        }
        throw new Error('Erro interno no servidor.')
      }

      if (!resposta.ok) {
        throw new Error(
          dados.erro || 'Não foi possível enviar o e-mail. Tente novamente.',
        )
      }

      mensagemFormulario.textContent =
        'Se houver uma conta associada a este e-mail, você receberá as instruções para redefinir sua senha.'
      mensagemFormulario.className = 'form-message success show'
      recuperarSenhaForm.reset()
    } catch (erro) {
      console.error('Erro ao solicitar recuperação de senha:', erro)
      mensagemFormulario.textContent =
        erro instanceof Error
          ? erro.message
          : 'Não foi possível enviar o e-mail. Tente novamente.'
      mensagemFormulario.className = 'form-message error show'
    } finally {
      enviarEmailButton.disabled = false
      enviarEmailButton.textContent = 'Enviar e-mail'
    }
  })
}

const alterarSenhaForm = document.querySelector('#alterar-senha-form')

if (alterarSenhaForm) {
  const senhaInput = alterarSenhaForm.querySelector('#senha')
  const confirmarSenhaInput = alterarSenhaForm.querySelector('#confirmar-senha')
  const strengthLabel = alterarSenhaForm.querySelector('#strength-label')
  const confirmacaoLabel = alterarSenhaForm.querySelector('#confirmacao-label')
  const strengthBars = [
    alterarSenhaForm.querySelector('#bar-1'),
    alterarSenhaForm.querySelector('#bar-2'),
    alterarSenhaForm.querySelector('#bar-3'),
  ]
  const mensagemFormulario = alterarSenhaForm.querySelector('#form-message')
  const alterarSenhaButton =
    alterarSenhaForm.querySelector('#btn-alterar-senha')
  const token = new URLSearchParams(window.location.search).get('token')

  function avaliarForcaSenha(senha) {
    let pontos = 0

    if (senha.length >= 12) pontos++
    if (senha.length >= 16) pontos++
    if (/[a-z]/.test(senha) && /[A-Z]/.test(senha)) pontos++
    if (/[0-9]/.test(senha)) pontos++
    if (/[^A-Za-z0-9]/.test(senha)) pontos++

    return pontos
  }

  function atualizarForcaSenha() {
    const senha = senhaInput.value
    const pontos = avaliarForcaSenha(senha)

    strengthBars.forEach((bar) => {
      bar.className = 'strength-bar'
    })

    if (senha.length === 0) {
      strengthLabel.textContent = 'Mínimo de 12 caracteres'
      return
    }

    if (senha.length < 12) {
      strengthBars[0].classList.add('fraca')
      strengthLabel.textContent = 'Senha muito curta'
      return
    }

    if (pontos <= 2) {
      strengthBars[0].classList.add('fraca')
      strengthLabel.textContent = 'Senha fraca'
    } else if (pontos <= 4) {
      strengthBars[0].classList.add('media')
      strengthBars[1].classList.add('media')
      strengthLabel.textContent = 'Senha média'
    } else {
      strengthBars.forEach((bar) => bar.classList.add('forte'))
      strengthLabel.textContent = 'Senha forte'
    }
  }

  function verificarConfirmacaoSenha() {
    const confirmacao = confirmarSenhaInput.value

    if (confirmacao.length === 0) {
      confirmacaoLabel.textContent = ''
      confirmacaoLabel.className = 'strength-label'
      return
    }

    if (senhaInput.value === confirmacao) {
      confirmacaoLabel.textContent = 'Senhas iguais'
      confirmacaoLabel.className = 'strength-label password-match'
    } else {
      confirmacaoLabel.textContent = 'As senhas não coincidem'
      confirmacaoLabel.className = 'strength-label password-mismatch'
    }
  }

  senhaInput.addEventListener('input', () => {
    atualizarForcaSenha()
    verificarConfirmacaoSenha()
  })
  confirmarSenhaInput.addEventListener('input', verificarConfirmacaoSenha)

  for (const [input, button] of [
    [senhaInput, alterarSenhaForm.querySelector('#toggle-senha')],
    [confirmarSenhaInput, alterarSenhaForm.querySelector('#toggle-confirmar')],
  ]) {
    button.addEventListener('click', () => {
      const mostrarSenha = input.type === 'password'
      input.type = mostrarSenha ? 'text' : 'password'
      button.textContent = mostrarSenha ? 'ocultar' : 'mostrar'
      button.setAttribute('aria-pressed', String(mostrarSenha))
      button.setAttribute(
        'aria-label',
        mostrarSenha ? 'Ocultar senha' : 'Mostrar senha',
      )
    })
  }

  alterarSenhaForm.addEventListener('submit', async (evento) => {
    evento.preventDefault()
    mensagemFormulario.textContent = ''
    mensagemFormulario.className = 'form-message'

    if (!token) {
      mensagemFormulario.textContent =
        'O link de recuperação está inválido ou incompleto. Solicite um novo e-mail.'
      mensagemFormulario.className = 'form-message error show'
      return
    }

    if (senhaInput.value.length < 12 || senhaInput.value.length > 64) {
      mensagemFormulario.textContent =
        'A senha deve ter entre 12 e 64 caracteres.'
      mensagemFormulario.className = 'form-message error show'
      senhaInput.focus()
      return
    }

    if (senhaInput.value !== confirmarSenhaInput.value) {
      mensagemFormulario.textContent = 'As senhas não coincidem.'
      mensagemFormulario.className = 'form-message error show'
      confirmarSenhaInput.focus()
      return
    }

    alterarSenhaButton.disabled = true
    alterarSenhaButton.textContent = 'Alterando...'

    try {
      const parametros = new URLSearchParams(window.location.search)
      const token = parametros.get('token')

      const resposta = await fetch('/senhas/alterar-senha', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: token,
          senha: senhaInput.value,
          confirmarSenha: confirmarSenhaInput.value,
        }),
      })

      let dados
      try {
        dados = await resposta.json()
      } catch {
        if (!resposta.ok) {
          throw new Error(
            `Não foi possível alterar a senha (erro ${resposta.status}).`,
          )
        }
        throw new Error('O servidor retornou uma resposta inválida.')
      }

      if (!resposta.ok) {
        throw new Error(
          dados.erro || 'Não foi possível alterar a senha. Tente novamente.',
        )
      }

      mensagemFormulario.textContent =
        dados.mensagem || 'Senha alterada com sucesso. Você já pode entrar.'
      mensagemFormulario.className = 'form-message success show'
      alterarSenhaForm.reset()
      atualizarForcaSenha()
      verificarConfirmacaoSenha()
      window.setTimeout(() => {
        window.location.href = 'login.html'
      }, 1800)
    } catch (erro) {
      console.error('Erro ao alterar senha:', erro)
      mensagemFormulario.textContent =
        erro instanceof Error
          ? erro.message
          : 'Não foi possível alterar a senha. Tente novamente.'
      mensagemFormulario.className = 'form-message error show'
    } finally {
      alterarSenhaButton.disabled = false
      alterarSenhaButton.textContent = 'Alterar senha'
    }
  })
}
