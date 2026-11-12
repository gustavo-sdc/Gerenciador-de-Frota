# Email de confirmação do Garagem

Arquivo para colar em **Supabase → Authentication → Emails → Confirm signup**.

- Assunto: `Confirme seu cadastro no Garagem`
- Corpo: `confirm-signup.html`
- Logo: servido em `{{ .SiteURL }}/garagem-icon-192.png`; o Site URL do Supabase precisa apontar para o site publicado que contém esse arquivo em `public/`.
- Remetente: para a caixa de entrada exibir **Garagem** em vez de **Supabase Auth**, configure um SMTP próprio em **Authentication → Emails → SMTP Settings** e defina o nome do remetente como `Garagem`. O nome do remetente não é controlado pelo HTML do template.

Após publicar o template, envie um cadastro de teste e confira a imagem e o link em celular e desktop. Alguns clientes de e-mail bloqueiam imagens externas até o destinatário autorizá-las.
