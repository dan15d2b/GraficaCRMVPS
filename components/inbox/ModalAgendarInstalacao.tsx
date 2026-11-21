"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { Calendar as CalendarIcon, Clock, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadTitle?: string;
  stageId: string;
  contactId?: string | null;
  conversationId: string;
  onSuccess?: () => void;
}

interface EventType {
  id: string;
  name: string;
  slug?: string;
  duration_minutes?: number;
  is_active?: boolean;
}

export function ModalAgendarInstalacao({
  open,
  onOpenChange,
  leadId,
  leadTitle,
  stageId,
  contactId,
  conversationId,
  onSuccess,
}: Props) {
  const t = useT();
  const qc = useQueryClient();

  // Data padrão: hoje
  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(hoje);
  const [hora, setHora] = useState("09:00");
  const [titulo, setTitulo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [selectedEventTypeId, setSelectedEventTypeId] = useState<string>("");

  useEffect(() => {
    if (open) {
      setData(new Date().toISOString().slice(0, 10));
      setHora("09:00");
      setTitulo(leadTitle ? `Instalação / Entrega - ${leadTitle}` : "Instalação / Entrega");
      setObservacoes("");

      // Carregar tipos de agendamento disponíveis
      apiClient
        .get<{ data: EventType[] }>("/api/v1/agenda/tipos")
        .then((res) => {
          const rows = res.data ?? [];
          setEventTypes(rows);

          // Tentar achar tipo correspondente a Instalação / Entrega
          const match = rows.find(
            (r) =>
              r.slug === "instalacao-entrega" ||
              r.name.toLowerCase().includes("instala") ||
              r.name.toLowerCase().includes("entrega")
          );

          if (match) {
            setSelectedEventTypeId(match.id);
          } else if (rows.length > 0) {
            setSelectedEventTypeId(rows[0].id);
          }
        })
        .catch((err) => {
          console.warn("[ModalAgendarInstalacao] Erro ao buscar tipos:", err);
        });
    }
  }, [open, leadTitle]);

  async function handleConfirmar() {
    if (!data) {
      toast.error(t("Selecione a data para o agendamento."));
      return;
    }

    setSubmitting(true);
    try {
      // 1. Formatar início no fuso de Brasília (-03:00)
      const horarioFormatado = (hora && hora.trim()) ? hora.trim() : "09:00";
      const startsAt = `${data}T${horarioFormatado}:00-03:00`;

      // 2. Se temos tipo de agendamento, criar compromisso na Agenda
      const eventTypeId = selectedEventTypeId || "a1e8cf32-9078-4f64-8d7b-7ff11c05f0ca";
      try {
        await apiClient.post("/api/v1/agenda/agendamentos", {
          event_type_id: eventTypeId,
          starts_at: startsAt,
          contact_id: contactId || undefined,
          conversation_id: conversationId || undefined,
          title: titulo.trim() || t("Instalação / Entrega"),
          notes: observacoes.trim() || undefined,
          duration_minutes: 60,
        });
      } catch (agendaErr: any) {
        console.warn("[ModalAgendarInstalacao] Falha ao registrar na agenda:", agendaErr);
      }

      // 3. Mover o lead para a etapa Pronto para Instalação / Entrega
      await apiClient.post("/api/v1/leads/bulk", {
        action: "move",
        lead_ids: [leadId],
        params: { stage_id: stageId },
      });

      toast.success(t("Compromisso adicionado na Agenda e etapa atualizada com sucesso!"));

      // Invalidação das queries relevantes
      void qc.invalidateQueries({ queryKey: ["crm-summary", contactId] });
      void qc.invalidateQueries({ queryKey: ["board"] });
      void qc.invalidateQueries({ queryKey: ["agenda"] });
      void qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      void qc.invalidateQueries({ queryKey: ["crm-side-panel"] });

      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error("[ModalAgendarInstalacao] Erro ao mover lead e agendar:", err);
      const msg = err?.message || err?.details?.message || t("Erro ao agendar compromisso.");
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <CalendarIcon className="size-5 text-primary" />
            {t("Agendar Instalação / Entrega")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t(
              "Escolha o dia e horário para registrar este compromisso na Agenda do CRM e mover o pedido para a etapa Pronto para Instalação / Entrega."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-2">
          {/* Título do agendamento */}
          <div className="space-y-1">
            <Label htmlFor="agenda-titulo" className="text-xs font-medium">
              {t("Título do Compromisso")}
            </Label>
            <Input
              id="agenda-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={t("Ex: Instalação Fachada Luminosa")}
              className="h-8 text-xs"
            />
          </div>

          {/* Data e Horário lado a lado */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="agenda-data" className="text-xs font-medium">
                {t("Data")} <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="agenda-data"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="h-8 text-xs"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="agenda-hora" className="text-xs font-medium">
                {t("Horário (opcional)")}
              </Label>
              <div className="relative">
                <Input
                  id="agenda-hora"
                  type="time"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  placeholder="09:00"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Tipo de serviço (se houver mais de um) */}
          {eventTypes.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor="agenda-tipo" className="text-xs font-medium">
                {t("Tipo de Serviço")}
              </Label>
              <select
                id="agenda-tipo"
                value={selectedEventTypeId}
                onChange={(e) => setSelectedEventTypeId(e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {eventTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Observações / Local */}
          <div className="space-y-1">
            <Label htmlFor="agenda-obs" className="text-xs font-medium">
              {t("Endereço / Observações (opcional)")}
            </Label>
            <Textarea
              id="agenda-obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder={t("Ex: Endereço da loja, ponto de referência ou contato no local...")}
              rows={2}
              className="resize-none text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="h-8 text-xs"
          >
            {t("Cancelar")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirmar}
            disabled={submitting || !data}
            className="h-8 text-xs gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {t("Agendando...")}
              </>
            ) : (
              <>
                <CalendarIcon className="size-3.5" />
                {t("Confirmar Agendamento")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
