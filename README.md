# 🎵 Cifrador v1.0.0

Uma ferramenta poderosa e inteligente para automação de cifras musicais, projetada para músicos que buscam organização, precisão e personalização técnica. O **Cifrador** transforma links do YouTube ou nomes de músicas em documentos formatados (DOCX/PDF) prontos para uso em apresentações ou estudos.

![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)

---

## ✨ Funcionalidades Principais

*   **🔍 Busca Inteligente**: Extrai automaticamente o conteúdo de links do YouTube ou via busca direta no Cifra Club.
*   **🎼 Transposição Automática**: Transponha o tom da música em tempo real (semitons) com ajuste instantâneo nos documentos exportados.
*   **🎨 Customização de Cores**: Diferencie visualmente seções críticas:
    *   **Refrão** (Chorus)
    *   **Pré-Refrão** (Pre-Chorus)
    *   **Ponte** (Bridge)
    *   E escolha cores personalizadas para Títulos, Acordes e Letras.
*   **📱 Layouts Adaptáveis**: Escolha entre o formato **A4 (Desktop)** ou o modo **Mobile (10x30cm)**, ideal para leitura em tablets e smartphones.
*   **📐 Dimensionamento Inteligente**: Cálculo dinâmico de fonte para evitar quebra de linhas indesejadas, mantendo a estrutura da cifra intacta.
*   **📄 Multi-Formato**: Exportação simultânea para **DOCX** (editável) e **PDF** (estático).

---

## 🚀 Tecnologias Utilizadas

- **Frontend**: Next.js 15+, React, Tailwind CSS.
- **Animações**: Framer Motion para uma experiência fluida e premium.
- **Processamento**: 
  - `cheerio`: Extração e parsing de conteúdo web.
  - `docx`: Geração de documentos Word de alta fidelidade.
  - `pdf-lib`: Manipulação e criação de PDFs customizados.
- **Ícones**: Lucide React.
- **Estilização**: Fontes Outfit e Inter.

---

## 🛠️ Como Executar o Projeto

1.  **Clone o repositório**:
    ```bash
    git clone https://github.com/seu-usuario/cifrador.git
    cd cifrador
    ```

2.  **Instale as dependências**:
    ```bash
    npm install
    ```

3.  **Inicie o ambiente de desenvolvimento**:
    ```bash
    npm run dev
    ```

4.  **Acesse no navegador**:
    `http://localhost:3000`

---

## 📖 Como Usar

1.  Insira o **nome da música** ou o **link do YouTube** no campo de busca.
2.  (Opcional) Abra o painel de **Opções de Formatação** para:
    - Ajustar o tom (Transpor).
    - Escolher a fonte (Courier New, Consolas, etc).
    - Definir as cores das seções.
3.  Clique em **Gerar Cifra Personalizada**.
4.  Aguarde o processamento e clique nos botões de **Baixar** desejados.

---

## 👨‍💻 Créditos

Desenvolvido por **mayck_eduardo**.

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.
