---
name: client-permissions
description: Use ao decidir quem pode ver ou fazer algo (papéis da equipe e do cliente, convites, desativação).
---

# Permissões

- A matriz está em `docs/PERMISSIONS.md`; o banco manda, a tela só esconde. Mudou uma permissão: ajuste função/política, a interface, a matriz, o teste 61 e uma mutação.
- Menor privilégio por padrão: prazo combinado, arquivar documento/pasta/empresa → gestão; categorias, SLA, configurações, convite de equipe → administração.
- Convite: token de 32 bytes, só o hash no banco, 7 dias, uso único, mesmo e-mail, mensagem uniforme de erro, limite de tentativas. O link aparece uma vez.
- Nunca remover/rebaixar o último administrador de uma empresa. Desativar usuário ou arquivar empresa derruba o acesso imediatamente.
