import { partesNoFuso } from "@/lib/agenda/fuso";
import { fusoUtilizavel } from "@/lib/tempo/fusos";

const doisDigitos = (n: number): string => String(n).padStart(2, "0");

const NOMES_DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const NOMES_MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/**
 * Feriados nacionais fixos brasileiros (formato "MM-DD").
 */
export const FERIADOS_NACIONAIS_FIXOS = new Set([
  "01-01", // Confraternização Universal / Ano Novo
  "04-21", // Tiradentes
  "05-01", // Dia do Trabalho
  "09-07", // Independência do Brasil
  "10-12", // Nossa Senhora Aparecida (Padroeira do Brasil)
  "11-02", // Finados
  "11-15", // Proclamação da República
  "11-20", // Dia Nacional de Zumbi e da Consciência Negra (Lei 14.759/2023)
  "12-25", // Natal
]);

/**
 * Calcula a data da Páscoa para determinado ano pelo algoritmo de Gauss (calendário gregoriano).
 */
export function calcularDataPascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

/**
 * Retorna todos os feriados nacionais de um determinado ano (fixos + móveis: Carnaval, Sexta-feira Santa, Corpus Christi).
 * Formato retornado: Set de "MM-DD".
 */
export function obterFeriadosNacionaisDoAno(ano: number): Set<string> {
  const feriados = new Set<string>(FERIADOS_NACIONAIS_FIXOS);

  const pascoa = calcularDataPascoa(ano);
  const dtPascoa = new Date(Date.UTC(ano, pascoa.mes - 1, pascoa.dia, 12, 0, 0));

  // Função auxiliar para subtrair/somar dias à Páscoa
  const chaveOffset = (offsetDias: number): string => {
    const dt = new Date(dtPascoa.getTime());
    dt.setUTCDate(dt.getUTCDate() + offsetDias);
    const m = doisDigitos(dt.getUTCMonth() + 1);
    const d = doisDigitos(dt.getUTCDate());
    return `${m}-${d}`;
  };

  // Carnaval (terça-feira: -47 dias da Páscoa)
  feriados.add(chaveOffset(-47));
  // Sexta-feira Santa / Paixão de Cristo (-2 dias da Páscoa)
  feriados.add(chaveOffset(-2));
  // Corpus Christi (+60 dias da Páscoa)
  feriados.add(chaveOffset(60));

  return feriados;
}

/**
 * Verifica se uma data cai em fim de semana (Sábado ou Domingo).
 */
export function ehFimDeSemana(data: Date, fuso: string = "America/Sao_Paulo"): boolean {
  const fusoVigor = fusoUtilizavel(fuso);
  const p = partesNoFuso(data, fusoVigor);
  const dtLocal = new Date(`${p.ano}-${doisDigitos(p.mes)}-${doisDigitos(p.dia)}T12:00:00.000Z`);
  const diaSemana = dtLocal.getUTCDay();
  return diaSemana === 0 || diaSemana === 6;
}

/**
 * Verifica se uma data é feriado nacional brasileiro (fixo ou móvel).
 */
export function ehFeriadoNacional(data: Date, fuso: string = "America/Sao_Paulo"): boolean {
  const fusoVigor = fusoUtilizavel(fuso);
  const p = partesNoFuso(data, fusoVigor);
  const feriadosAno = obterFeriadosNacionaisDoAno(p.ano);
  const chaveFeriado = `${doisDigitos(p.mes)}-${doisDigitos(p.dia)}`;
  return feriadosAno.has(chaveFeriado);
}

/**
 * Verifica se uma data específica é dia útil (segunda a sexta, excluindo feriados fixos).
 */
export function ehDiaUtil(data: Date, fuso: string = "America/Sao_Paulo"): boolean {
  if (ehFimDeSemana(data, fuso)) return false;
  if (ehFeriadoNacional(data, fuso)) return false;
  return true;
}

export interface ResultadoDiasUteis {
  dataIso: string; // YYYY-MM-DD
  dataCompleta: Date;
  diaSemana: string; // ex: "Quinta-feira"
  formatadaCurta: string; // ex: "26/11/2026 (Quinta)"
  formatadaExtenso: string; // ex: "Quinta-feira, 26 de novembro de 2026"
  diasUteis: number;
  diasUteisCalculados: number;
}

/**
 * Calcula a data estimada de entrega somando dias úteis a partir de uma data inicial.
 * Pula fins de semana (sábado e domingo) e feriados nacionais fixos.
 */
export function calcularDataEntregaDiasUteis(
  dataInicio: Date = new Date(),
  diasUteis: number = 5,
  fuso: string = "America/Sao_Paulo",
): ResultadoDiasUteis {
  const fusoVigor = fusoUtilizavel(fuso);
  const pInicio = partesNoFuso(dataInicio, fusoVigor);

  // Base em UTC ancorada na meia-noite do dia local
  const atual = new Date(`${pInicio.ano}-${doisDigitos(pInicio.mes)}-${doisDigitos(pInicio.dia)}T12:00:00.000Z`);

  let contagem = 0;
  const diasAlvo = Math.max(1, diasUteis);
  const cacheFeriados = new Map<number, Set<string>>();

  while (contagem < diasAlvo) {
    // Avança 1 dia corrido
    atual.setUTCDate(atual.getUTCDate() + 1);

    const ano = atual.getUTCFullYear();
    const mes = atual.getUTCMonth() + 1;
    const dia = atual.getUTCDate();
    const diaSemana = atual.getUTCDay();

    // Checar se é fim de semana (Sábado ou Domingo)
    if (diaSemana === 0 || diaSemana === 6) continue;

    // Checar se é feriado nacional (fixo ou móvel)
    let feriadosAno = cacheFeriados.get(ano);
    if (!feriadosAno) {
      feriadosAno = obterFeriadosNacionaisDoAno(ano);
      cacheFeriados.set(ano, feriadosAno);
    }

    const chaveFeriado = `${doisDigitos(mes)}-${doisDigitos(dia)}`;
    if (feriadosAno.has(chaveFeriado)) continue;

    contagem++;
  }

  const anoFinal = atual.getUTCFullYear();
  const mesFinal = atual.getUTCMonth() + 1;
  const diaFinal = atual.getUTCDate();
  const diaSemanaFinal = atual.getUTCDay();

  const diaSemanaNome = NOMES_DIAS_SEMANA[diaSemanaFinal] ?? "Dia";
  const mesNome = NOMES_MESES[mesFinal - 1] ?? "";

  const dataIso = `${anoFinal}-${doisDigitos(mesFinal)}-${doisDigitos(diaFinal)}`;
  const formatadaCurta = `${doisDigitos(diaFinal)}/${doisDigitos(mesFinal)}/${anoFinal} (${diaSemanaNome.split("-")[0]})`;
  const formatadaExtenso = `${diaSemanaNome}, ${doisDigitos(diaFinal)} de ${mesNome} de ${anoFinal}`;

  return {
    dataIso,
    dataCompleta: atual,
    diaSemana: diaSemanaNome,
    formatadaCurta,
    formatadaExtenso,
    diasUteis: diasAlvo,
    diasUteisCalculados: diasAlvo,
  };
}
