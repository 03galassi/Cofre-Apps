# Cofre de Acessos

Aplicativo web para guardar **logins de sites e serviços** (nome, URL, login, senha e observações), com:

- login com e-mail e senha (Firebase Authentication);
- **recuperação de senha por e-mail** (o Firebase envia um link para redefinir a senha);
- troca obrigatória da senha inicial `000000` no primeiro acesso;
- dados guardados no **Cloud Firestore**, acessíveis apenas pelo e-mail autorizado;
- saída automática após 10 minutos sem uso e ao fechar a aba;
- visual colorido com animações suaves (desligadas automaticamente se o aparelho pedir menos movimento);
- fontes de leitura fácil: Lexend (títulos), Atkinson Hyperlegible (textos) e JetBrains Mono (senhas e endereços);
- tema claro e escuro automáticos, funciona no celular e no computador.

Hospedagem: **GitHub Pages** (gratuito). Banco de dados e login: **Firebase** (plano gratuito Spark é suficiente).

---

## Estrutura

```
index.html            o app completo (visual, lógica e configuração do Firebase)
sw.js                 permite instalar o app e abrir mais rápido
manifest.webmanifest  nome, cores e ícones do app instalado
firestore.rules       regras de segurança do banco ← você cola no Firebase
.nojekyll             necessário para o GitHub Pages
```

> `app.js`, `styles.css` e `firebase-config.js` são de uma versão antiga e não são usados pelo `index.html`.

---

## Passo a passo

### 1. Criar o projeto no Firebase

1. Acesse <https://console.firebase.google.com> e clique em **Adicionar projeto** (ex.: `cofre-de-acessos`). O Google Analytics pode ficar desativado.
2. No menu **Criação > Authentication**, clique em **Vamos começar**, abra a aba **Método de login** e ative **E-mail/senha**.
3. Na aba **Usuários**, clique em **Adicionar usuário**:
   - E-mail: `03galassi@gmail.com`
   - Senha: `000000`
4. Na aba **Configurações > Ações do usuário**, desmarque **Ativar criação (inscrição)**. Assim ninguém consegue criar outra conta no seu projeto.
5. (Recomendado) Em **Templates > Redefinição de senha**, escolha o idioma **Português (Brasil)** e, se quiser, edite o nome do remetente e o texto do e-mail.

### 2. Criar o banco de dados

1. No menu **Criação > Firestore Database**, clique em **Criar banco de dados**.
2. Escolha a localização `southamerica-east1 (São Paulo)` e o **modo de produção**.
3. Abra a aba **Regras**, apague o conteúdo e cole o conteúdo do arquivo `firestore.rules`. Clique em **Publicar**.

### 3. Ligar o app ao Firebase

1. Em **Configurações do projeto** (engrenagem) > **Geral** > **Seus apps**, clique no ícone **Web `</>`**, dê um nome (ex.: `cofre-web`) e clique em **Registrar app**. Não precisa ativar o Firebase Hosting.
2. Copie os valores do objeto `firebaseConfig` que aparecem na tela.
3. Abra `index.html`, procure o bloco **CONFIGURAÇÃO DO FIREBASE** e substitua os valores de exemplo (`COLE_AQUI`, `SEU-PROJETO` etc.) pelos copiados.

> Esses valores identificam o projeto e podem ficar públicos no GitHub. Quem protege os dados são as regras do Firestore e o login.

### 4. Publicar no GitHub Pages

1. Crie um repositório no GitHub (ex.: `cofre-de-acessos`). Pode ser público ou privado (privado exige plano pago do GitHub para usar o Pages).
2. Envie todos os arquivos desta pasta para o repositório. Pelo navegador: **Add file > Upload files**, arraste os arquivos e pastas e clique em **Commit changes**. Pelo terminal:
   ```bash
   git init
   git add .
   git commit -m "Cofre de Acessos"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/cofre-de-acessos.git
   git push -u origin main
   ```
3. No repositório, vá em **Settings > Pages**, em **Source** escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** e salve.
4. Em 1 ou 2 minutos o endereço aparece no topo da página, no formato `https://SEU-USUARIO.github.io/cofre-de-acessos/`.

### 5. Autorizar o endereço no Firebase

No Firebase, em **Authentication > Configurações > Domínios autorizados**, clique em **Adicionar domínio** e informe `SEU-USUARIO.github.io` (sem `https://` e sem a pasta). Sem isso, o link de recuperação de senha não volta para o app.

### 6. Primeiro acesso

1. Abra o endereço do GitHub Pages.
2. Entre com `03galassi@gmail.com` e a senha `000000`.
3. O app pede uma senha nova (mínimo de 8 caracteres). A partir daí, a `000000` deixa de funcionar.

---

## Como funciona a recuperação de senha

1. Na tela de entrada, toque em **Esqueci minha senha** e confirme o e-mail.
2. O Firebase envia um e-mail com um link. Se não aparecer na caixa de entrada, confira o spam e a aba Promoções.
3. O link abre uma página do Firebase para definir a senha nova; depois é só voltar ao app e entrar.

---

## Segurança

- Só o e-mail `03galassi@gmail.com` lê e grava dados: a regra do Firestore confere o usuário logado e o e-mail. Para trocar o e-mail autorizado, altere-o em `firestore.rules` (publique de novo no Firebase) **e** em `ALLOWED_EMAIL`, no `index.html`.
- Os cadastros ficam no Firestore do seu projeto Google. Quem tiver acesso ao console do Firebase com a sua conta Google consegue ver os dados, então proteja essa conta com verificação em duas etapas.
- A sessão termina ao fechar a aba e após 10 minutos sem uso (ajustável em `LOCK_AFTER_MINUTES`, no `index.html`).

## Estrutura dos dados no Firestore

```
users/{uid}/logins/{id}  →  nome, url, login, senha, obs, criado, atualizado
```

A área “Meus Aplicativos” foi removida do app. Cadastros antigos dessa área continuam guardados no Firestore em `users/{uid}/apps` (não foram apagados); só não aparecem mais na tela.

Nenhum campo é obrigatório; a URL é guardada sem `http(s)://`.
