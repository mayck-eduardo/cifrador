# 🎵 Cifrador v1.0.0

> Ferramenta inteligente para automação de cifras musicais — transforma nomes de músicas ou links do YouTube em documentos formatados (DOCX/PDF) prontos para uso.

[![Live Demo](https://img.shields.io/badge/🌐_Demo-cifrador--chi.vercel.app-blueviolet?style=for-the-badge)](https://cifrador-chi.vercel.app/)

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

---

## ✨ Funcionalidades

- **🔍 Busca Inteligente** — Pesquisa diretamente na API do CifraClub. Suporta nome da música, artista, ou link direto.
- **🎬 Link do YouTube** — Cole um link do YouTube e o Cifrador extrai automaticamente o título e busca a cifra correspondente.
- **🎼 Transposição em Tempo Real** — Transponha o tom da cifra de -12 a +12 semitons com preservação de espaçamento.
- **🎨 Cores Customizáveis** — Personalize as cores de cada seção:
  - Títulos, Acordes, Letras
  - Refrão, Pré-Refrão, Ponte
- **📱 Layouts Adaptáveis** — Formato **A4 (Desktop)** ou **Mobile (10×30cm)** para leitura em dispositivos móveis.
- **🧹 Ocultar Tablaturas** — Remove tablaturas diretamente do DOM (como o `#tabs=false` do CifraClub) + limpeza algorítmica.
- **🎸 Versão Simplificada** — Acordes básicos do CifraClub para iniciantes.
- **📐 Dimensionamento Inteligente** — Cálculo dinâmico de tamanho de fonte para evitar quebra de linhas.
- **📄 Multi-Formato** — Exportação simultânea para **DOCX** (editável) e **PDF** (estático).
- **🎯 Seções Destacadas** — Marcadores como `[Refrão]`, `[Ponte]`, `[Pré-Refrão]` recebem destaque amarelo automático.

---

## 🚀 Tech Stack

| Camada | Tecnologia |
|---|---|
| **Framework** | Next.js 16, React 19 |
| **Linguagem** | TypeScript |
| **Estilização** | Tailwind CSS 4, Fontes Outfit & Inter |
| **Animações** | Framer Motion |
| **Scraping** | Cheerio |
| **Geração DOCX** | docx |
| **Geração PDF** | pdf-lib |
| **Ícones** | Lucide React |
| **Deploy** | Vercel |

---

## 🛠️ Como Executar

```bash
# Clone o repositório
git clone https://github.com/mayck-eduardo/cifrador.git
cd cifrador

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento
npm run dev
```

Acesse em: `http://localhost:3000`

---

## 📖 Como Usar

1. Insira o **nome da música** (ex: `Lugar Secreto Gabriela Rocha`) ou um **link do YouTube** no campo de busca.
2. *(Opcional)* Expanda o painel de **Opções de Formatação** para:
   - Escolher formatos de exportação (DOCX/PDF)
   - Selecionar layout da página (A4 ou Mobile)
   - Personalizar cores das seções
   - Escolher a fonte do documento
   - Transpor o tom
   - Ocultar tablaturas
   - Usar versão simplificada
3. Clique em **Gerar Cifra Personalizada**.
4. Aguarde o processamento e clique em **Baixar DOCX** ou **Baixar PDF**.

---

## 📁 Estrutura do Projeto

```
cifrador/
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Layout raiz com metadata e fontes
│   │   ├── page.tsx         # Interface principal (client component)
│   │   ├── globals.css      # Estilos globais + Tailwind
│   │   └── favicon.ico
│   └── lib/
│       └── actions.ts       # Server Actions (busca, scraping, geração de arquivos)
├── package.json
├── next.config.ts
├── tsconfig.json
└── README.md
```

---

## 🔧 Arquitetura

O projeto utiliza **Next.js Server Actions** para processar as requisições server-side:

1. **Busca** → API Solr do CifraClub (`solr.sscdn.co`) com fallback para Google
2. **Extração** → Cheerio faz parse do HTML e extrai o `<pre>` com a cifra
3. **Processamento** → Transposição de acordes, remoção de tabs, identificação de seções
4. **Geração** → Criação de documentos DOCX (via `docx`) e PDF (via `pdf-lib`) com formatação e cores
5. **Download** → Retorno em Base64 para download client-side

---

## 👨‍💻 Autor

Desenvolvido por **[@mayck_eduardo](https://github.com/mayck-eduardo)**.

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.
