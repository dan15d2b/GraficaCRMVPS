"use client";

import { useState, useRef } from "react";
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
import { useUploadMedia } from "@/hooks/inbox/useUploadMedia";
import { useCriarProva } from "@/hooks/inbox/useProvas";
import { UploadCloud, FileText, CheckCircle2, Loader2, X, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  contactId?: string | null;
}

export function ModalEnviarProva({
  open,
  onOpenChange,
  conversationId,
  contactId,
}: Props) {
  const [osNumber, setOsNumber] = useState("");
  const [titulo, setTitulo] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviarWhatsapp, setEnviarWhatsapp] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMedia = useUploadMedia();
  const criarProva = useCriarProva();

  const isSubmitting = uploadMedia.isPending || criarProva.isPending;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files[0]) {
      const f = files[0];
      setArquivo(f);
      if (!titulo.trim()) {
        const nomeSemExt = f.name.replace(/\.[^/.]+$/, "");
        setTitulo(nomeSemExt);
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0];
      setArquivo(f);
      if (!titulo.trim()) {
        const nomeSemExt = f.name.replace(/\.[^/.]+$/, "");
        setTitulo(nomeSemExt);
      }
    }
  }

  async function handleEnviar() {
    if (!arquivo) {
      toast.error("Selecione o arquivo da arte (PDF ou Imagem).");
      return;
    }
    if (!titulo.trim()) {
      toast.error("Informe a descrição ou título da arte.");
      return;
    }

    try {
      // 1. Upload do arquivo
      const uploadRes = await uploadMedia.mutateAsync({
        conversationId,
        file: arquivo,
        filename: arquivo.name,
        destino: "mensagem",
      });

      // 2. Criar a prova digital
      await criarProva.mutateAsync({
        conversation_id: conversationId,
        contact_id: contactId ?? undefined,
        os_number: osNumber.trim() || undefined,
        titulo: titulo.trim(),
        file_url: uploadRes.storage_path,
        file_name: arquivo.name,
        file_mime: uploadRes.media_mime,
        file_size_bytes: uploadRes.media_size_bytes,
        enviar_whatsapp: enviarWhatsapp,
      });

      toast.success("Prova digital gerada e enviada com sucesso!");
      onOpenChange(false);

      // Limpar formulário
      setOsNumber("");
      setTitulo("");
      setArquivo(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar prova digital.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="flex size-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <FileText className="size-4" />
            </span>
            Enviar Prova Digital (Arte/Layout)
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            O cliente receberá o link para conferir textos, telefones e cores. Ao aprovar, o lead é movido
            automaticamente para <strong>Em Produção</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Número da O.S. e Título */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1.5">
              <Label htmlFor="os-number" className="text-xs font-semibold">
                Nº da O.S. (opcional)
              </Label>
              <Input
                id="os-number"
                placeholder="Ex: 1048"
                value={osNumber}
                onChange={(e) => setOsNumber(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="titulo-arte" className="text-xs font-semibold">
                Título / Descrição da Arte *
              </Label>
              <Input
                id="titulo-arte"
                placeholder="Ex: Adesivo Vinil 100x50cm"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Upload do Arquivo */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Arquivo da Arte (PDF, JPG, PNG) *</Label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,application/pdf"
              className="hidden"
            />

            {arquivo ? (
              <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
                <div className="flex items-center gap-2.5 min-w-0">
                  {arquivo.type.includes("pdf") ? (
                    <FileText className="size-6 text-red-500 shrink-0" />
                  ) : (
                    <ImageIcon className="size-6 text-blue-600 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{arquivo.name}</p>
                    <p className="text-[11px] text-blue-700/80">
                      {(arquivo.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setArquivo(null)}
                  className="rounded-md p-1 text-blue-600 hover:bg-blue-100 hover:text-blue-900 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-6 text-center hover:border-blue-400 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <div className="size-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-2">
                  <UploadCloud className="size-5" />
                </div>
                <p className="text-xs font-semibold text-slate-700">
                  Clique para selecionar ou arraste o arquivo aqui
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  PDF de alta qualidade, JPG ou PNG (até 50MB)
                </p>
              </div>
            )}
          </div>

          {/* Opção de Envio no WhatsApp */}
          <div className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
            <input
              type="checkbox"
              id="enviar-whatsapp"
              checked={enviarWhatsapp}
              onChange={(e) => setEnviarWhatsapp(e.target.checked)}
              className="mt-0.5 size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <div className="text-xs">
              <label htmlFor="enviar-whatsapp" className="font-semibold text-slate-800 cursor-pointer">
                Enviar link de aprovação automaticamente no WhatsApp
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5">
                O cliente receberá a prévia com botão de aprovação e também poderá responder "Aprovado" no chat.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleEnviar()}
            disabled={isSubmitting || !arquivo || !titulo.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Enviando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5" />
                <span>Enviar Prova Digital</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
