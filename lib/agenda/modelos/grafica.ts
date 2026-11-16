import type {
  CategoriaDeAgendamento,
  LocalDeAgendamento,
} from "../tipos";

/**
 * Modelo declarativo de um tipo de agendamento especializado da GráficaCRM.
 */
export interface ModeloTipoAgendamentoGrafica {
  name: string;
  slug: string;
  description: string;
  category: CategoriaDeAgendamento;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_minutes: number;
  slot_interval_minutes: number | null;
  booking_window_days: number;
  location_kind: LocalDeAgendamento;
  requires_confirmation: boolean;
  reminder_enabled: boolean;
  reminder_minutes_before: number;
  reminder_body: string;
  reminder_extra_offsets_minutes: number[];
  position: number;
}

/**
 * Os 4 serviços essenciais de agenda para Gráficas e Comunicação Visual:
 * 1. 📏 Medição Técnica no Local (Vistoria / Levantamento Métrico)
 * 2. 🛠️ Instalação / Aplicação Externa (Equipe de Campo)
 * 3. 📦 Entrega Programada de Material (Rota de Logística)
 * 4. 🤝 Reunião de Amostras e Briefing (Consultoria Comercial Presencial)
 */
export const MODELOS_DE_AGENDAMENTO_GRAFICA: ModeloTipoAgendamentoGrafica[] = [
  {
    name: "Medição Técnica no Local",
    slug: "medicao-tecnica",
    category: "vistoria",
    duration_minutes: 60,
    buffer_before_minutes: 15,
    buffer_after_minutes: 15,
    minimum_notice_minutes: 180,
    slot_interval_minutes: 60,
    booking_window_days: 30,
    location_kind: "in_person",
    requires_confirmation: true,
    reminder_enabled: true,
    reminder_minutes_before: 1440, // 24h antes
    reminder_body:
      "Olá, {nome}! Lembrando que nossa equipe técnica da GráficaCRM está confirmada para realizar a Medição Técnica no Local amanhã às {horario} no endereço informado. Por favor, certifique-se de que haverá alguém para autorizar o acesso à área.",
    reminder_extra_offsets_minutes: [120], // 2h antes reforço
    position: 1000,
    description:
      "Levantamento métrico in loco (fachadas, vitrines, totens, placas, lonas e adesivação). Conferência de recuos, pontos de energia e fotos técnicas para o projeto executivo.",
  },
  {
    name: "Instalação / Aplicação Externa",
    slug: "instalacao-externa",
    category: "procedimento",
    duration_minutes: 120,
    buffer_before_minutes: 30,
    buffer_after_minutes: 30,
    minimum_notice_minutes: 1440,
    slot_interval_minutes: 120,
    booking_window_days: 45,
    location_kind: "in_person",
    requires_confirmation: true,
    reminder_enabled: true,
    reminder_minutes_before: 1440, // 24h antes
    reminder_body:
      "Olá, {nome}! Sua instalação de comunicação visual está agendada para amanhã às {horario}. Nossa equipe de campo estará no local com toda a estrutura e materiais. Havendo necessidade de liberação de portaria ou alvará, por favor já nos confirme!",
    reminder_extra_offsets_minutes: [180], // 3h antes
    position: 2000,
    description:
      "Deslocamento e montagem de estruturas metálicas, fixação de placas ACM, tensionamento de lonas, aplicação de vinil adesivo, fixação de letras caixa e iluminação.",
  },
  {
    name: "Entrega Programada de Material",
    slug: "entrega-programada",
    category: "outro",
    duration_minutes: 30,
    buffer_before_minutes: 10,
    buffer_after_minutes: 10,
    minimum_notice_minutes: 120,
    slot_interval_minutes: 30,
    booking_window_days: 20,
    location_kind: "in_person",
    requires_confirmation: false,
    reminder_enabled: true,
    reminder_minutes_before: 120, // 2h antes
    reminder_body:
      "Olá, {nome}! Seu pedido finalizado saiu para entrega em rota programada e deve chegar por volta das {horario}. Por gentileza, mantenha alguém responsável para recebimento e conferência.",
    reminder_extra_offsets_minutes: [],
    position: 3000,
    description:
      "Rota logística de entrega de materiais impressos e finalizados (banners, faixas, cartões, panfletos, brindes) com termo de recebimento assinado.",
  },
  {
    name: "Reunião de Amostras e Briefing",
    slug: "reuniao-amostras",
    category: "reuniao",
    duration_minutes: 45,
    buffer_before_minutes: 15,
    buffer_after_minutes: 15,
    minimum_notice_minutes: 180,
    slot_interval_minutes: 45,
    booking_window_days: 30,
    location_kind: "in_person",
    requires_confirmation: true,
    reminder_enabled: true,
    reminder_minutes_before: 1440, // 24h antes
    reminder_body:
      "Olá, {nome}! Tudo bem? Nosso consultor comercial estará com você amanhã às {horario} com o mostruário físico de materiais (acrílicos, vinis, papéis nobres e acabamentos) para definirmos seu projeto.",
    reminder_extra_offsets_minutes: [60], // 1h antes
    position: 4000,
    description:
      "Visita comercial com mostruário de substratos e amostras físicas de acabamento para alinhamento de especificações e fechamento de proposta.",
  },
];
