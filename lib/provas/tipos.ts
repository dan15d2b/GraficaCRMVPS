export type ArteProvaStatus = "pendente" | "aprovada" | "rejeitada" | "cancelada";
export type ArteProvaDecidedVia = "link" | "whatsapp";

export interface ArteProva {
  id: string;
  organization_id: string;
  contact_id: string;
  conversation_id: string | null;
  lead_id: string | null;
  token: string;
  os_number: string | null;
  titulo: string;
  file_url: string;
  file_name: string;
  file_mime: string;
  file_size_bytes: number;
  status: ArteProvaStatus;
  decided_at: string | null;
  decided_via: ArteProvaDecidedVia | null;
  rejection_reason: string | null;
  client_ip: string | null;
  client_user_agent: string | null;
  checklist_agreed: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CriarProvaInput {
  organizationId: string;
  conversationId: string;
  contactId?: string;
  leadId?: string;
  osNumber?: string;
  titulo: string;
  fileUrl: string;
  fileName: string;
  fileMime?: string;
  fileSizeBytes?: number;
  enviarWhatsapp?: boolean;
  userId?: string;
  baseUrl?: string;
}

export interface DecidirProvaInput {
  token: string;
  action: "aprovar" | "rejeitar";
  notes?: string;
  clientIp?: string;
  clientUserAgent?: string;
  decidedVia?: ArteProvaDecidedVia;
}

export interface ProvaPublicaDTO {
  token: string;
  titulo: string;
  os_number: string | null;
  file_url: string;
  file_name: string;
  file_mime: string;
  file_size_bytes: number;
  status: ArteProvaStatus;
  decided_at: string | null;
  decided_via: ArteProvaDecidedVia | null;
  rejection_reason: string | null;
  created_at: string;
  empresa: {
    nome: string;
    logo_url: string | null;
    cor_destaque: string;
  };
}
