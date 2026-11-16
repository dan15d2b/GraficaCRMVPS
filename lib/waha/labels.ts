/**
 * Gestão de etiquetas do WhatsApp via WAHA e mapeamento de cores.
 */
import { getWahaClient, WahaClient } from "@/lib/waha/client";

export interface WahaLabel {
  id: string;
  name: string;
  color?: number;
  colorHex?: string;
}

/**
 * Mapeamento de hex do Deskcomm (PALETA_DE_ETIQUETAS) para o índice numérico do WhatsApp Business (0..19).
 */
const HEX_PARA_COR_WAHA: Record<string, number> = {
  "#0091ff": 1, // Azul
  "#ffe629": 2, // Amarelo
  "#ffb224": 3, // Âmbar
  "#3e63dd": 8, // Índigo
  "#00655a": 12, // Verde-água
  "#cf3716": 13, // Vermelho
  "#6f6f6f": 18, // Cinza
  "#ab4aba": 19, // Roxo
};

const COR_WAHA_PARA_HEX: Record<number, string> = {
  1: "#0091ff",
  2: "#ffe629",
  3: "#ffb224",
  8: "#3e63dd",
  12: "#00655a",
  13: "#cf3716",
  18: "#6f6f6f",
  19: "#ab4aba",
};

export function hexParaCorWaha(hex: string | null | undefined): number {
  if (!hex) return 18;
  const normalizado = hex.trim().toLowerCase();
  return HEX_PARA_COR_WAHA[normalizado] ?? 18;
}

export function corWahaParaHex(colorIndex: number | undefined): string {
  if (colorIndex === undefined) return "#6f6f6f";
  return COR_WAHA_PARA_HEX[colorIndex] ?? "#6f6f6f";
}

function resolverCliente(client?: WahaClient | null): WahaClient {
  if (client) return client;
  const c = getWahaClient();
  if (c) return c;
  const url = process.env.WAHA_API_BASE_URL ?? "http://localhost:3000";
  const key = process.env.WAHA_API_KEY ?? "test";
  return new WahaClient(url, key);
}

export async function listarEtiquetasWaha(session: string, client?: WahaClient | null): Promise<WahaLabel[]> {
  const cli = resolverCliente(client);
  return cli.getLabels(session);
}

export async function criarEtiquetaWaha(
  session: string,
  nome: string,
  cor?: number,
  client?: WahaClient | null,
): Promise<WahaLabel> {
  const cli = resolverCliente(client);
  return cli.createLabel(session, { name: nome, color: cor });
}

export async function obterEtiquetasDoChatWaha(
  session: string,
  chatId: string,
  client?: WahaClient | null,
): Promise<WahaLabel[]> {
  const cli = resolverCliente(client);
  return cli.getChatLabels(session, chatId);
}

export async function definirEtiquetasDoChatWaha(
  session: string,
  chatId: string,
  labelIds: string[],
  client?: WahaClient | null,
): Promise<void> {
  const cli = resolverCliente(client);
  return cli.putChatLabels(session, chatId, labelIds);
}

export async function obterChatsPorEtiquetaWaha(
  session: string,
  labelId: string,
  client?: WahaClient | null,
): Promise<Array<{ id: string; pnJid?: string }>> {
  const cli = resolverCliente(client);
  return cli.getChatsByLabel(session, labelId);
}
