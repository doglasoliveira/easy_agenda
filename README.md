# Easy Agenda — agenda do estúdio (100% gratuita)

Agenda online para um estúdio com vários profissionais (manicure, aulas de música, etc.).

| Ficheiro | O que é | Onde fica |
|---|---|---|
| `index.html` | Site onde os clientes marcam | GitHub Pages |
| `admin.html` | **Painel do estúdio** (protegido por senha) | GitHub Pages |
| `manifest.webmanifest`, `admin.webmanifest`, `sw.js`, `pwa.js`, `icons/` | Web app instalável (ícone, offline) | GitHub Pages |
| `apps-script/Code.gs` + `apps-script/appsscript.json` | Backend: guarda os dados e liga ao Google Calendar | Google Apps Script (conta do estúdio) |

**No painel o estúdio pode:**
- **Relatórios:** realizados, faturação, valor médio, faltas, agendados e pendentes. Inclui gráfico por dia, semana ou mês, totais por profissional e por serviço, filtros por período, profissional, serviço e estado, e exportação CSV (abre no Excel).
- **Marcações:** aprovar ou recusar pedidos, cancelar, registar faltas e criar marcações de telefone ou balcão.
- **Profissionais:** criar, editar ou desativar; escolher os serviços que cada um faz e o horário semanal. Se indicares o e-mail do profissional, o calendário dele é partilhado automaticamente com ele.
- **Serviços:** nome, duração, preço, descrição e ativo/inativo.
- **Folgas:** férias, consultas ou pausas por profissional (ou para todos), de dia inteiro ou por horas. Dá também para marcar os **dias de estúdio fechado** (feriados).
- **Definições:** nome, morada, e-mail de notificações, antecedência, confirmação automática e senha.

> Abre o `admin.html` sem configurar nada para o ver em **modo demonstração** com dados fictícios.

---

## 1. Backend (Apps Script), cerca de 10 min

1. Entra em **script.google.com** com a conta Google do estúdio e cria um **Novo projeto**.
2. Cola o `Code.gs` no lugar do código que lá está.
3. Vai a **Definições do projeto** (⚙️), ativa *"Mostrar ficheiro de manifesto appsscript.json"*, abre esse ficheiro no editor e cola o `appsscript.json`. Isto ativa a partilha automática de calendários.
4. **Senha do painel:** no `Code.gs`, procura `function definirSenhaAdmin`, escreve a senha em `const SENHA = '...'`, escolhe essa função no topo e clica **Executar**. Depois apaga a senha do código e guarda.
5. Escolhe a função **`setup`** e clica **Executar**. Aceita as permissões (Calendar e e-mail).
6. Vai a **Implementar → Nova implementação → App da Web**, com:
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
7. Copia o URL que termina em `/exec`.

## 2. Sites (GitHub Pages), cerca de 5 min

1. Cola o URL em `const API_URL = '...'` **nos dois ficheiros**: `index.html` e `admin.html`.
2. Cria um repositório no GitHub (ex.: `agenda`) e faz upload dos dois ficheiros.
3. Vai a **Settings → Pages → Branch: main / root → Save**.
4. Os endereços ficam assim:
   - Clientes: `https://<utilizador>.github.io/agenda/`
   - Estúdio: `https://<utilizador>.github.io/agenda/admin.html`
5. No painel, em **Definições**, cola o link do site de clientes. Ele aparece nos e-mails de cancelamento e recusa.

## 3. Primeiros passos no painel

1. **Serviços:** apaga ou edita os de exemplo e cria os teus.
2. **Profissionais:** cria cada profissional com os serviços e o horário. O formato do horário é `09:00-13:00, 14:00-19:00`, e dias em branco contam como folga.
3. **Folgas / feriados:** marca as férias e os dias de estúdio fechado.

## 4. A agenda no telemóvel do profissional

- **Automático:** se indicares o e-mail do profissional no painel, ele recebe um convite para o calendário dele (com permissão para editar).
  - *Google / Android:* o calendário aparece no Google Calendar.
  - *iPhone:* em Definições → Calendário → Contas, adiciona a conta Google. O calendário aparece no Calendário do iPhone.
- **Se usar só iCloud** (sem conta Google): no Google Calendar do estúdio, abre as definições do calendário do profissional e copia o **"Endereço secreto em formato iCal"**. No iPhone, vai a Definições → Calendário → Contas → Adicionar conta → Outra → **Adicionar calendário subscrito**. Fica só de leitura e a Apple pode demorar a atualizar.
- O profissional pode bloquear um horário criando um evento no seu calendário. Esse horário deixa de aparecer no site.

## 5. Como os dados funcionam

- **Profissionais, serviços e definições** ficam guardados no próprio Apps Script (Propriedades do Script).
- **Marcações e folgas** são eventos nos Google Calendars dos profissionais. É deles que saem os relatórios:
  - Pendente = ⏳ amarelo
  - Confirmado = ✅ verde
  - Faltou = 🚫 cinzento
  - Uma marcação confirmada cuja hora já passou conta como **Realizado**.
- Cada marcação guarda o preço do momento em que foi feita, por isso mudar preços não altera relatórios antigos.
- Recusas e cancelamentos apagam o evento (libertam o horário) e não entram nos relatórios.
- Profissionais e serviços desativados deixam de aparecer no site, mas o histórico mantém-se.

## 6. Instalar como app (telemóvel e computador)

Os dois sites são **web apps**, por isso podem ser instalados como uma app normal, com o ícone do Easy Agenda.

| Ficheiro | O que é |
|---|---|
| `manifest.webmanifest` | App dos clientes ("Agenda", ícone coral) |
| `admin.webmanifest` | App do estúdio ("Painel", ícone azul-escuro) |
| `sw.js` | Guarda os ficheiros da app para abrir rápido e mesmo sem internet |
| `pwa.js` | Botão "📲 Instalar" e cor da barra do navegador |
| `icons/` | Ícones (SVG e PNG em vários tamanhos) |

**Como instalar:**
- **Android / Chrome / Edge:** toca no botão **📲 Instalar** que aparece no topo, ou usa o menu do navegador → *Instalar app*.
- **iPhone / iPad (Safari):** toca em **Partilhar** ⬆️ e depois em **Adicionar ao ecrã principal**. O botão "Instalar" mostra estas instruções.
- **Computador (Chrome/Edge):** clica no ícone de instalar na barra de endereço.

**Bom saber:**
- As marcações e os horários vêm sempre da internet: nunca ficam guardados. Sem rede, a app abre e avisa que está offline.
- **Ao publicar alterações aos ficheiros**, muda a linha `const VERSION = 'easy-agenda-v1'` no `sw.js` (para `v2`, `v3`, …). Assim os telemóveis recebem a versão nova.
- O nome da app é "Easy Agenda". Para usar o nome do estúdio, muda `name` e `short_name` no `manifest.webmanifest`.

## 7. Atualizar o código

Usa **Implementar → Gerir implementações → ✏️ → Versão: Nova versão**. Assim o URL mantém-se.

> **Se vens da v1:** os calendários já criados são reaproveitados automaticamente. Depois de atualizares, confirma os profissionais e serviços no painel. Os de exemplo do código só servem até guardares algo.

## Limites do plano gratuito

- **E-mails:** uma conta Gmail normal envia 100 por dia. Um pedido online usa 2 a 3 e-mails, o que dá para cerca de 30 a 40 pedidos por dia. Com Google Workspace o limite é 1500.
- **Relatórios:** cada consulta cobre até 400 dias. Com muitos profissionais e períodos longos, pode demorar alguns segundos.
- **Segurança:** o `admin.html` é público, mas sem a senha não mostra nem altera nada. A sessão expira ao fim de 12 h, e depois de 10 tentativas erradas o login fica bloqueado durante 15 min.
