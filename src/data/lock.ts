/**
 * Trava de carregamento da base de conhecimento (2.14.0, NAT-61, plano §5.1).
 *
 * No perfil `knowledge-free` nenhum carregador de conhecimento do gov.br DS ou do e-MAG pode rodar:
 * a ausência de conhecimento é garantida por construção, não só por busca de texto nas respostas.
 * Cada carregador de `data/load.ts` e `data/knowledge.ts` chama `guardKnowledge(nome)` na entrada;
 * travado, ele conta a tentativa e lança. Um lançamento vira erro da ferramenta (visível ao runner) e
 * o contador sai na telemetria: uma execução com contador > 0 falha no isolamento.
 *
 * Dois escopos:
 *   - processo: `lockKnowledgeForProcess()`, ligado pelo `createServer` do perfil (padrão). Vale para
 *     todo o processo, inclusive código fora das ferramentas.
 *   - chamada: `runKnowledgeLocked(fn)`, um AsyncLocalStorage em volta de cada ferramenta do perfil.
 *     É o que permite, nos testes e no inventário, um servidor `evaluation` e um `knowledge-free` no
 *     mesmo processo sem que um trave o outro.
 *
 * Fica liberado o que não é conhecimento do DS/e-MAG: o registro público da WCAG 2.2
 * (`verify/registries.ts`, `getWcagRegistry`) e o bundle do axe-core.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const scope = new AsyncLocalStorage<true>();
let processLocked = false;
let attempts = 0;
const attemptedLoaders: string[] = [];

export class KnowledgeLockedError extends Error {
  readonly code = "knowledge-locked" as const;
  constructor(readonly loader: string) {
    super(`Carregador de conhecimento '${loader}' chamado num perfil sem conhecimento (knowledge-free).`);
    this.name = "KnowledgeLockedError";
  }
}

export function isKnowledgeLocked(): boolean {
  return processLocked || scope.getStore() === true;
}

/** Chamado na entrada de cada carregador de conhecimento. Travado: conta e lança. */
export function guardKnowledge(loader: string): void {
  if (!isKnowledgeLocked()) return;
  attempts += 1;
  if (attemptedLoaders.length < 50) attemptedLoaders.push(loader);
  throw new KnowledgeLockedError(loader);
}

export function lockKnowledgeForProcess(): void {
  processLocked = true;
}

export function runKnowledgeLocked<T>(fn: () => T): T {
  return scope.run(true, fn);
}

/** Tentativas de carregar conhecimento sob a trava, desde o início do processo. */
export function knowledgeLockAttempts(): { attempts: number; loaders: string[] } {
  return { attempts, loaders: [...attemptedLoaders] };
}

/** Testes apenas. */
export function resetKnowledgeLock(): void {
  processLocked = false;
  attempts = 0;
  attemptedLoaders.length = 0;
}
