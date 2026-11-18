import { describe, expect, it, vi } from "vitest";
import { identificarIntencaoDeEtapaPorTags, sincronizarEtapaDoFunilPorTags } from "./sincronia-tags-funil";

describe("sincronia-tags-funil", () => {
  it("identifica corretamente a etapa a partir de tags da conversa", () => {
    expect(identificarIntencaoDeEtapaPorTags(["fazer orcamento"])).toBe("orcamento");
    expect(identificarIntencaoDeEtapaPorTags(["Fazer Orçamento"])).toBe("orcamento");
    expect(identificarIntencaoDeEtapaPorTags(["acompanhar"])).toBe("acompanhar");
    expect(identificarIntencaoDeEtapaPorTags(["acompanhar proposta"])).toBe("acompanhar");
    expect(identificarIntencaoDeEtapaPorTags(["produto em andamento"])).toBe("producao");
    expect(identificarIntencaoDeEtapaPorTags(["pedido em andamento"])).toBe("producao");
    expect(identificarIntencaoDeEtapaPorTags(["em produção"])).toBe("producao");
    expect(identificarIntencaoDeEtapaPorTags(["pronto para retirada"])).toBe("retirada");
    expect(identificarIntencaoDeEtapaPorTags(["pronto para instalação"])).toBe("instalacao");
    expect(identificarIntencaoDeEtapaPorTags(["concluido"])).toBe("concluido");
    expect(identificarIntencaoDeEtapaPorTags(["tag_qualquer"])).toBe(null);
  });

  it("não move se não houver tag correspondente a etapas", async () => {
    const mockSupabase = {} as never;
    const res = await sincronizarEtapaDoFunilPorTags(mockSupabase, {
      organizationId: "org-1",
      conversationId: "conv-1",
      tags: ["tag_sem_etapa"],
    });
    expect(res.movidos).toBe(0);
  });
});
