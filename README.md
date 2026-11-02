# Corex

Site público do COREX (https://corex.mainstay-x.com.br). Só entram aqui os arquivos do navegador.

Duas travas impedem publicar outra coisa:
- `.gitignore` ignora tudo, exceto a lista de arquivos do site.
- `.githooks/pre-push` recusa o push com arquivo fora da lista, chave secreta, CPF ou lista de telefones ou e-mails.

Depois de clonar, ative a verificação:

    git config core.hooksPath .githooks

Arquivo novo do site entra na lista do `.gitignore` e na variável `allowed` do `pre-push`.
