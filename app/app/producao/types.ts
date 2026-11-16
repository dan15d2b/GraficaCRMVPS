export type PrazoStatus = "atrasado" | "hoje" | "amanha" | "no_prazo" | "sem_prazo";

export interface ItemDeProducao {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "won" | "lost";
  pipeline_id: string;
  pipeline_name: string;
  stage_id: string;
  stage_name: string;
  stage_color: string | null;
  stage_tipo: "producao" | "retirada" | "instalacao" | "concluido" | "outro";
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  value_cents: number | null;
  currency: string | null;
  expected_close_date: string | null;
  stage_changed_at: string | null;
  created_at: string;
  updated_at: string;
  tags: string[];
  custom_fields: Record<string, unknown>;
  // Dados derivados do prazo
  prazoStatus: PrazoStatus;
  diasRestantes: number | null;
  prazoFormatado: string;
}

export interface EtapaProducaoRef {
  id: string;
  name: string;
  slug: string;
  pipeline_id: string;
  tipo: "producao" | "retirada" | "instalacao" | "concluido" | "outro";
  color: string | null;
  is_won?: boolean;
}

export interface MetricasProducao {
  totalGeral: number;
  totalEmProducao: number;
  totalAtrasados: number;
  totalHojeAmanha: number;
  totalNoPrazo: number;
  totalSemPrazo: number;
  totalProntoRetirada: number;
  totalProntoInstalacao: number;
  valorTotalCents: number;
}
