# Implementação das melhorias do Shorts Generator

## Pedido ao Claude Code
Implemente todas as oito melhorias abaixo neste repositório. O usuário autorizou desenvolvimento local.
Não entregue somente análise, plano, interfaces vazias ou recomendações: desenvolva os fluxos completos.
Leia AGENTS.md e CLAUDE.md; procure GEMINI.md (ausente na análise inicial). O código atual é a referência.
Siga Plan -> Act -> Validate. Revalide os achados antes de alterar o código.
Você compartilha o workspace com outros agentes: preserve alterações alheias e não reverta trabalho existente.
Use arquivos com no máximo 150 linhas, separação de responsabilidades e os padrões existentes.
Ao tocar arquivos que já excedem esse limite, extraia responsabilidades sem uma refatoração global.

## Escopo e limites
- Workspace: D:/Solutions/pessoal/shorts-generator.
- Canais: https://www.youtube.com/@akitemquiz e https://www.youtube.com/@santidade-catolica.
- Desenvolva backend, persistência, migrations, frontend, integração das filas, testes e documentação necessários.
- Pode instalar dependências locais usando o gerenciador e lockfile do projeto.
- Não faça commit, push, merge, deploy, alterações no cluster, renovação OAuth ou publicação real.
- Não envie mensagens pelo Telegram nem modifique vídeos ou configurações dos canais remotos.
- Não leia ou exponha segredos, arquivos de tokens ou conteúdo de .env; use fixtures e configurações de teste.
- Preserve tokens criptografados; jobs devem referenciar contas, nunca serializar credenciais resolvidas.
- Todo corte deve continuar incluindo o link do vídeo original na descrição, inclusive após edição manual.
- Não ative quizzes no cluster nem altere a linha editorial dos canais remotos automaticamente.
- Para decisões reversíveis locais, use seu julgamento e documente a decisão; prossiga sem pedir reconfirmação.
- Serviços externos indisponíveis devem virar limitações explícitas, nunca resultados inventados.

## 1. Metadados confiáveis — prioridade alta
Evidência: https://www.youtube.com/watch?v=QQCFNuAT188 contém presenter no título e na descrição.
buildPresenterTitle aceita esse placeholder; a segunda geração de título não exige explicitamente pt-BR.
Referências: src/core/presenter-title.ts e src/core/youtube-metadata.service.ts.
- Valide por schema título, descrição, tags e apresentador; rejeite placeholders e nomes sem evidência.
- Aplique idioma configurável por canal, com pt-BR como padrão compatível, também na reescrita final.
- Confira fidelidade entre título e transcrição; não transforme especulação do entrevistado em fato confirmado.
- Use tentativas limitadas e fallback seguro; preserve a fonte obrigatória fora do texto livre editável.
- Aceite: presenter/unknown/null textual não aparecem publicados; idioma incorreto é corrigido ou retido;
  falha do LLM não remove a atribuição nem permite metadados inválidos; testes cobrem esses casos.

## 2. Histórico persistente e deduplicação — prioridade alta
Evidência: vKs6S_QmI_M e gaKLyebzxwY têm título semelhante, duração 54s e fonte twIo4kE-hsU.
Isso é indício, não prova de igualdade audiovisual. A deduplicação atual é apenas por análise.
Referências: src/core/analyzer-chunks.ts, pipeline.ts, pipeline-video-processor.ts, queue.ts e state.ts.
- Persista canal de destino, fonte, intervalo ORIGINAL, assinatura textual, artefato e resultado de publicação.
- Não confunda timestamps relativos ao arquivo baixado com timestamps absolutos do vídeo original.
- Bloqueie intervalos sobrepostos e conteúdo equivalente já reservado, gerado ou publicado no mesmo canal.
- Faça reserva atômica com unicidade/concorrência; permita outros trechos inéditos da mesma fonte.
- Use identidade estável nos jobs e reconciliação de falha após upload, evitando retries cegos de publicação.
- Trate upload com resultado incerto como reconciliação necessária; não prometa exactly-once da API externa.
- Aceite: duas execuções concorrentes não publicam o mesmo corte; retomada não duplica; canais são isolados;
  uma falha recuperável não bloqueia o corte para sempre; registros antigos continuam utilizáveis.

## 3. Perfil editorial por canal — prioridade alta
A listagem pública de Aki Tem Quiz mistura quizzes e cortes diversos; não presuma a intenção editorial.
Os focos atuais não são passados ao prompt principal em src/core/analyzer-generation.ts.
- Adicione idioma, temas permitidos/excluídos, tom e formatos permitidos ao perfil, API e painel.
- Propague o perfil à descoberta, seleção, revisão, quiz e metadados, não somente ao título final.
- Valide aderência antes de renderizar; registre motivos de rejeição e preserve contexto e autoria da fala.
- Ofereça presets editáveis para quizzes/curiosidades e conteúdo católico, sem aplicar a contas reais.
- Aceite: perfis diferentes produzem restrições diferentes; tema excluído é retido; migrations têm defaults
  explícitos e não desativam silenciosamente o fluxo cuts existente ou a restrição CHANNEL_FLOW_MODE.

## 4. Feedback por janelas comparáveis — prioridade alta
src/core/viral-feedback.ts classifica os últimos 60 Shorts por views acumuladas, ignorando idade.
- Persista snapshots e compare publicações em janelas equivalentes de 24h, 72h e 7 dias.
- Separe canal/formato/tema; imponha amostra mínima e não rotule vídeos imaturos como fracassos.
- Integre YouTube Analytics para duração média, percentual assistido e inscritos ganhos, conforme suporte.
- Registre videoId publicado e atributos editoriais necessários para relacionar métricas às decisões.
- Referência oficial: https://developers.google.com/youtube/analytics/metrics.
- Documente permissões OAuth adicionais; não renove credenciais ou solicite consentimento durante esta tarefa.
- Sem Analytics, use fallback público limitado com idade conhecida ou suspenda a classificação comparativa.
- Aceite: vídeo recente não vira exemplo negativo por idade; cache, quota, erro e ausência de permissão são
  tratados; coleta agendada e consulta do feedback estão conectadas ao pipeline, com testes de contrato.

## 5. Veto editorial e divergências — prioridade alta
src/core/clip-quality.ts permite que structurallyProven ignore uma reprovação e eleve a nota a pelo menos 8.
- Remova a aprovação automática de candidatos explicitamente reprovados pela revisão editorial.
- Use a heurística como evidência auxiliar, sem substituir julgamento de contexto, gancho e conclusão.
- Encaminhe divergências para reavaliação limitada ou revisão humana; persista notas e justificativas.
- Aceite: approved=false não publica automaticamente; omissão/erro de revisão não aprova; uma reavaliação
  legítima tem resultado rastreável. Ajuste testes que hoje consagram o comportamento antigo.

## 6. Quizzes verificáveis — prioridade média
O prompt exige três perguntas e tamanhos máximos, mas quiz.domain.ts aceita 2–4 e strings sem limites.
Referências: src/core/quiz/quiz-content.service.ts, quiz.domain.ts e quiz-pipeline.ts.
- Exija três perguntas; valide pergunta até 45 caracteres, opções até 15, título até 60 e hook até 22.
- Rejeite opções repetidas normalizadas, vazias, respostas ambíguas e perguntas já utilizadas recentemente.
- Implemente banco de perguntas revisadas ou validação factual ancorada em fontes com procedência persistida.
- Não considere pedir ao mesmo modelo para verificar os fatos uma verificação independente suficiente.
- Se não houver evidência confiável, retenha para revisão; não invente fontes ou percentuais de acerto.
- Varie chamadas e remova afirmações estatísticas como só 1% quando não houver medição.
- Aceite: schemas bloqueiam entradas inválidas antes de TTS/render; fixtures verificam respostas e fontes;
  histórico impede repetição; o pipeline completo usa a validação e o perfil editorial.

## 7. Prévia, edição e aprovação — prioridade média
src/core/youtube-upload.service.ts publica diretamente com privacyStatus=public.
- Adicione por canal modos automático e revisar antes, com política de migração explícita.
- Crie fila editorial com vídeo, legenda, título, descrição, fonte, notas e justificativa da seleção.
- Permita editar metadados e limites do corte; alterar limites exige regenerar legenda e artefato.
- Revalide alterações; preserve fonte; vincule aprovação à versão exata do artefato/metadados.
- Aprovar, rejeitar e solicitar regeneração devem ser ações autenticadas, persistidas e idempotentes.
- Aceite: modo revisão não faz upload antes da aprovação; edição invalida aprovação anterior;
  requisições concorrentes não duplicam publicação; o fluxo funciona pela UI e pela API.

## 8. Execução durável e estados verdadeiros — prioridade média
admin-run-routes.ts inicia geração dentro da API; completeRun marca completed mesmo com erros nos resultados.
- Mova geração para fila durável com worker separado, checkpoints e retomada após reinício.
- Preserve processamento sequencial de vídeos e imponha limites de concorrência por canal/recurso.
- Modele gerado, revisão pendente, publicação pendente, publicado, falha parcial e falha, sem sucesso fictício.
- Faça API, CLI, workers e painel refletirem os mesmos contratos e mostrar falhas/retries acionáveis.
- Resolva credenciais atuais no worker por referência, permitindo rotação sem reenfileirar segredos antigos.
- Aceite: reinício da API não perde execução; um corte falhado gera falha parcial; publicação enfileirada
  não aparece publicada; retomada usa checkpoints e preserva as proteções de deduplicação.

## Validação e entrega
1. Inspecione o estado atual e escreva um plano curto cobrindo os oito itens; então implemente.
2. Instale dependências se necessário (node_modules estava ausente); preserve o lockfile salvo mudança justificada.
3. Rode npm test, npm run build, npm run smoke-test e lint, conforme AGENTS.md.
4. Não havia script lint no package.json: configure um lint real e execute-o, sem desativar regras para passar.
5. Rode testes/build do web; adicione E2E de prévia, aprovação, edição, rejeição e isolamento de canais.
6. Teste migrations e concorrência com PostgreSQL/Redis locais isolados; não use o cluster de produção.
7. Valide um render real local com FFmpeg/ffprobe e fixture sem credenciais, sem publicar ou notificar.
8. Cubra falhas de LLM, Analytics, worker, banco e resultado incerto do upload com testes significativos.
9. Documente configuração, migrations, worker, rollback e limitações; não confunda mocks com integração real.
10. Entregue docs/CLAUDE_RELATORIO_IMPLEMENTACAO.md com matriz dos oito itens, arquivos, testes executados,
    resultados reais, pendências e limites de validação. Respeite 150 linhas também nesse relatório.
11. Se atingir limite de execução, deixe checkpoint concreto para retomada; não declare trabalho incompleto pronto.
12. Revise o diff final e confirme que nenhum segredo, publicação remota ou alteração alheia foi incluído.
