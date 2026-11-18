export interface ItemOrcamento {
  id?: string;
  descricao: string;
  quantidade: number;
  medidas?: string; // ex: "2,00 x 1,00m", "10x15cm"
  acabamento?: string; // ex: "Ilhós a cada 30cm", "Laminação fosca"
  valor_unitario_cents: number;
  valor_total_cents: number;
}

export interface OrcamentoExtraido {
  numero_orcamento?: string;
  cliente_nome?: string;
  itens: ItemOrcamento[];
  valor_total_cents: number;
  forma_pagamento?: string;
  prazo_dias_uteis: number;
  data_estimada_entrega?: string; // YYYY-MM-DD
  data_estimada_entrega_formatada?: string; // "Quinta-feira, 26/11/2026"
  observacoes?: string;
  mensagem_sugerida: string;
}

export interface ParseOrcamentoInput {
  texto?: string;
  organizationId?: string;
  fuso?: string;
}

export interface AplicarOrcamentoInput {
  conversationId: string;
  contactId?: string;
  leadId?: string;
  orcamento: OrcamentoExtraido;
  enviarMensagemImediata?: boolean;
}
