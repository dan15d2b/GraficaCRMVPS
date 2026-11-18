/**
 * OS QUATRO FOLLOW-UPS DE UMA GRÁFICA E COMUNICAÇÃO VISUAL.
 *
 * 1. Orçamento · retorno de proposta enviada (escada de 4 toques):
 *    O orçamento foi enviado em PDF e o cliente ainda não respondeu. Acompanha por 12 dias
 *    e encerra sem ser invasivo.
 *
 * 2. Arte · aprovação de layout / prova digital:
 *    Cobra o cliente para aprovar o layout/prova visual enviada para liberar a produção dos materiais.
 *
 * 3. Produção · aviso de material pronto para retirada:
 *    Avisa imediatamente o cliente no WhatsApp que o material gráfico está finalizado,
 *    conferido e disponível no balcão de retirada.
 *
 * 4. Pós-entrega · fidelização e recompra:
 *    Acompanha o cliente após a entrega para colher feedback e estimular novas tiragens e materiais.
 */
import type { ModeloDeFollowup } from "./tipos";
import { montarEscada } from "./escada";

const DIA_MS = 86_400_000;

const O_ATENDIMENTO_ASSUME = "O cliente respondeu — quem segue a conversa é o atendimento.";

export const MODELOS_DE_GRAFICA: readonly ModeloDeFollowup[] = [
  {
    id: "grafica-orcamento-retorno",
    nicho: "grafica",
    nome: "Orçamento · retorno de proposta enviada",
    jornada: "Orçamento",
    resumo:
      "O orçamento em PDF foi enviado e o cliente não respondeu. Acompanha por 12 dias com 4 toques profissionais.",
    oQueDispara: "O negócio entrar na etapa do funil que você escolher.",
    pedeEtapa: true,
    handoffPolicy: "pause",
    gatilho: ({ stageId }) => ({
      kind: "stage_change",
      params: { stage_id: stageId! },
      cancel_on_reply: true,
    }),
    grafo: montarEscada({
      prazoDeRespostaMs: 2 * DIA_MS,
      sim: { rotulo: "Aprovou orçamento", padrao: "aprovo" },
      notaDeResposta: O_ATENDIMENTO_ASSUME,
      toques: [
        {
          esperaAntesMs: DIA_MS,
          rotulo: "Confirmação do envio",
          texto:
            "Olá! Tudo bem? Passando para confirmar se você conseguiu dar uma olhada na proposta com os valores dos seus materiais que te enviamos ontem. Ficou alguma dúvida sobre materiais, medidas ou prazo de entrega?",
        },
        {
          esperaAntesMs: 2 * DIA_MS,
          rotulo: "Apoio com arte e acabamento",
          texto:
            "Oi! Sobre o seu orçamento de materiais: se você quiser ajustar quantidades ou simular em outro acabamento mais econômico, nossa equipe pode recalcular para você. Sua arte gráfica já está pronta para impressão ou precisa de criação?",
        },
        {
          esperaAntesMs: 4 * DIA_MS,
          rotulo: "Reserva de matéria-prima",
          texto:
            "Olá! Para garantirmos esse valor e a matéria-prima no prazo combinado, precisamos dar entrada na produção. Conseguimos aprovar para rodar o pedido esta semana?",
        },
        {
          esperaAntesMs: 6 * DIA_MS,
          rotulo: "Último aviso e arquivamento",
          texto:
            "Olá! Como não tivemos retorno, vou deixar sua cotação arquivada por aqui para não incomodar. Quando você decidir produzir seus materiais, é só nos chamar por este mesmo número. Tenha um ótimo dia!",
        },
      ],
    }),
  },

  {
    id: "grafica-aprovacao-arte",
    nicho: "grafica",
    nome: "Arte · aprovação de layout / prova digital",
    jornada: "Arte & Layout",
    resumo:
      "Cobra o cliente para aprovar o layout/prova visual enviada para liberar a produção dos materiais.",
    oQueDispara: "O negócio entrar na etapa do funil que você escolher.",
    pedeEtapa: true,
    handoffPolicy: "pause",
    gatilho: ({ stageId }) => ({
      kind: "stage_change",
      params: { stage_id: stageId! },
      cancel_on_reply: true,
    }),
    grafo: montarEscada({
      prazoDeRespostaMs: 2 * DIA_MS,
      sim: { rotulo: "Aprovou arte", padrao: "aprovado" },
      notaDeResposta: O_ATENDIMENTO_ASSUME,
      toques: [
        {
          esperaAntesMs: DIA_MS,
          rotulo: "Cobrança de aprovação de arte",
          texto:
            "Olá! Tudo bem? Passando para saber se você conseguiu conferir o modelo/prova da arte que te enviamos. Ficou aprovada para mandarmos para a produção?",
        },
        {
          esperaAntesMs: 2 * DIA_MS,
          rotulo: "Apoio com alterações na arte",
          texto:
            "Oi! Caso precise de qualquer ajuste de textos, cores ou acabamentos na arte gráfica, avise nossa equipe por aqui para adiantarmos!",
        },
        {
          esperaAntesMs: 4 * DIA_MS,
          rotulo: "Urgência de fechamento da grade",
          texto:
            "Olá! Estamos montando as chapas e grades de impressão desta semana. Se conseguir aprovar a arte hoje, garantimos seu material no prazo combinado. Conseguimos rodar?",
        },
      ],
    }),
  },

  {
    id: "grafica-pronto-retirada",
    nicho: "grafica",
    nome: "Produção · aviso de material pronto para retirada",
    jornada: "Retirada",
    resumo:
      "Avisa o cliente no WhatsApp que o material gráfico está finalizado e pronto no balcão de retirada.",
    oQueDispara: "O negócio entrar na etapa do funil que você escolher.",
    pedeEtapa: true,
    handoffPolicy: "pause",
    gatilho: ({ stageId }) => ({
      kind: "stage_change",
      params: { stage_id: stageId! },
      cancel_on_reply: true,
    }),
    grafo: montarEscada({
      prazoDeRespostaMs: 2 * DIA_MS,
      sim: { rotulo: "Cliente vai retirar", padrao: "vou retirar" },
      notaDeResposta: O_ATENDIMENTO_ASSUME,
      toques: [
        {
          rotulo: "Aviso de retirada imediata",
          texto:
            "Olá! Boas notícias: o seu pedido já está finalizado, conferido e pronto para retirada em nosso balcão! Você já pode vir buscar durante nosso horário de atendimento. Qualquer dúvida estamos à disposição!",
        },
        {
          esperaAntesMs: 3 * DIA_MS,
          rotulo: "Lembrete de retirada",
          texto:
            "Oi! Passando para lembrar que o seu material já está embalado e aguardando você no balcão de retirada. Te esperamos!",
        },
        {
          esperaAntesMs: 5 * DIA_MS,
          rotulo: "Segundo lembrete de retirada",
          texto:
            "Olá! Seu material continua guardado com segurança em nosso balcão de retirada. Caso precise que outra pessoa retire ou queira combinar entrega, avise a gente por aqui!",
        },
      ],
    }),
  },

  {
    id: "grafica-pos-entrega",
    nicho: "grafica",
    nome: "Pós-entrega · fidelização e recompra",
    jornada: "Pós-venda",
    resumo:
      "Acompanha o cliente após a entrega para colher feedback e estimular novas tiragens e materiais.",
    oQueDispara: "O negócio entrar na etapa do funil que você escolher.",
    pedeEtapa: true,
    handoffPolicy: "pause",
    gatilho: ({ stageId }) => ({
      kind: "stage_change",
      params: { stage_id: stageId! },
      cancel_on_reply: true,
    }),
    grafo: montarEscada({
      prazoDeRespostaMs: 3 * DIA_MS,
      sim: { rotulo: "Cliente respondeu", padrao: "gostei" },
      notaDeResposta: O_ATENDIMENTO_ASSUME,
      toques: [
        {
          esperaAntesMs: 3 * DIA_MS,
          rotulo: "Confirmação de recebimento e satisfação",
          texto:
            "Olá! Tudo bem? Passando para saber se você já conferiu os seus materiais gráficos e se ficou tudo conforme o esperado! Sua satisfação é nossa prioridade.",
        },
        {
          esperaAntesMs: 20 * DIA_MS,
          rotulo: "Lembrete de reposição e novos pedidos",
          texto:
            "Oi! Tudo bem? Passando para lembrar que estamos com condições especiais em materiais gráficos e comunicação visual este mês. Precisa repor algum impresso, adesivo ou banner?",
        },
      ],
    }),
  },
];
