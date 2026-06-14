function mostrarPagina(idPagina) {
  const paginas = document.querySelectorAll(".page");
  paginas.forEach((pagina) => {
    pagina.classList.remove("active-page");
  });
  const paginaAtiva = document.getElementById(idPagina);
  if (paginaAtiva) {
    paginaAtiva.classList.add("active-page");
  }
  const btnAtivo = document.querySelectorAll(".btn-header");
  btnAtivo.forEach((btn) => {
    btn.classList.remove("btn-header-active");
  });
  const btnAtual = document.getElementById("btn-" + idPagina);
  if (btnAtual) {
    btnAtual.classList.add("btn-header-active");
  }
}

window.onload = () => mostrarPagina("dashboard");
