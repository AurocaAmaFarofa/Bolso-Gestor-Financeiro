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
