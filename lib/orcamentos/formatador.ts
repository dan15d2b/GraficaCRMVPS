import type { ItemOrcamento } from "./tipos";

export function formatarDinheiro(centavos: number): string {
  const reais = (centavos / 100).toFixed(2);
  const [inteiro, decimal] = reais.split(".");
  const inteiroFormatado = (inteiro ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${inteiroFormatado},${decimal}`;
}

/**
 * Constrói a mensagem padrão elegante do WhatsApp para o cliente.
 * Pura função de formatação de string - segura para uso em Client e Server.
 */
export function gerarMensagemDoOrcamento(
  dados: {
    numero_orcamento?: string;
    itens: ItemOrcamento[];
    valor_total_cents: number;
    forma_pagamento?: string;
    prazo_dias_uteis: number;
    data_estimada_entrega_formatada?: string;
  },
): string {
  const numeroLabel = dados.numero_orcamento ? ` (Nº #${dados.numero_orcamento})` : "";
  const linhasItens = dados.itens.map((it) => {
    const qtdStr = it.quantidade > 1 ? `${it.quantidade.toLocaleString("pt-BR")}x ` : "";
    const medidasStr = it.medidas ? ` [${it.medidas}]` : "";
    const acabamentoStr = it.acabamento ? ` (${it.acabamento})` : "";
    const valorStr = it.valor_total_cents > 0 ? ` - ${formatarDinheiro(it.valor_total_cents)}` : "";
    return `• ${qtdStr}${it.descricao}${medidasStr}${acabamentoStr}${valorStr}`;
  });

  const textoItens =
    linhasItens.length > 0 ? linhasItens.join("\n") : "• Material conforme especificações combinadas.";

  const pagamentoStr = dados.forma_pagamento?.trim() || "50% de entrada + 50% na retirada (PIX ou Cartão)";
  const prazoStr = `${dados.prazo_dias_uteis} dias úteis${
    dados.data_estimada_entrega_formatada ? ` (previsão: ${dados.data_estimada_entrega_formatada})` : ""
  }`;

  return (
    `📄 *ORÇAMENTO DE PRODUÇÃO*${numeroLabel}\n\n` +
    `*Itens do Pedido:*\n` +
    `${textoItens}\n\n` +
    `💰 *Valor Total:* ${formatarDinheiro(dados.valor_total_cents)}\n` +
    `💳 *Condições de Pagamento:* ${pagamentoStr}\n` +
    `⏱️ *Prazo de Produção:* ${prazoStr}\n\n` +
    `_O prazo de produção passa a contar a partir da aprovação da arte._\n\n` +
    `Posso confirmar e gerar a Ordem de Serviço para você?`
  );
}
