function mostrarPagina(idPagina) {
  const paginas = document.querySelectorAll(".page");
  paginas.forEach((pagina) => {
    pagina.classList.remove("active-page");
  });
  const paginaAtiva = document.getElementById(idPagina);
  if (paginaAtiva) {
    paginaAtiva.classList.add("active-page");
  }
}

window.onload = () => mostrarPagina("dashboard");
