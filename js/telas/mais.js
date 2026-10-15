// Tela Mais: atalhos para as telas que não cabem no menu
const itens = [
  ['#/eventos', 'Eventos', 'Criar eventos e escolher o evento deste aparelho'],
  ['#/pacote', 'Preparar outros aparelhos', 'Enviar ou receber catálogo, taxas e eventos'],
  ['#/estoque', 'Estoque do evento', 'Quantidades levadas, brindes e avarias'],
  ['#/fechamento', 'Fechamento do evento', 'Totais, resumo por dia e exportação'],
  ['#/painel', 'Painel de vendas', 'Vendas do aparelho, protegido por PIN'],
  ['#/configuracoes', 'Configurações', 'Aparelho, taxas, categorias de retirada, PIN e tema']
];

export function render(el) {
  el.innerHTML = `
    <header class="cab"><h1>Mais</h1></header>
    <ul class="lista lista-links">
      ${itens.map(([href, titulo, sub]) => `
        <li><a href="${href}">
          <span><strong>${titulo}</strong><br><span class="sub">${sub}</span></span>
          <span class="seta" aria-hidden="true">›</span>
        </a></li>`).join('')}
    </ul>`;
}
