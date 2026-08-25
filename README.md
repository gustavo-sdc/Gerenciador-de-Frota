# 🚚 Gerenciamento de Frota - SaaS

Um sistema completo de gerenciamento de frotas para empresas de logística e transporte. Desenvolvido no modelo **SaaS (Software as a Service)**, o projeto foca em eficiência operacional, controle de veículos, rotas e manutenção preventiva.

> 🛠️ **100% Handcrafted:** Este projeto foi totalmente desenvolvido à mão, sem o uso de ferramentas de IA ou geradores de código. Desde o setup da arquitetura com **Vite**, estilização utilitária com **Tailwind CSS**, componentes em **ReactJS**, modelagem de banco de dados e regras de segurança via RLS no **Supabase** até as suítes de testes, cada linha de código foi escrita manualmente.

---

## 📌 Funcionalidades Principais

- **Gestão de Veículos:** Cadastro, histórico de manutenção e status da frota em tempo real.
- **Controle de Motoristas:** Registro de condutores, controle de habilitação (CNH) e atribuição de viagens.
- **Rastreamento e Rotas:** Gestão de trajetos, consumo de combustível e estimativa de custos por viagem.
- **Manutenção Preventiva:** Alertas automáticos para revisões com base em quilometragem e tempo de uso.
- **Autenticação & Controle de Acesso:** Login seguro e níveis de permissão com Supabase Auth e RLS (Row Level Security).
- **Dashboards Operacionais:** Interface responsiva e em tempo real para tomada de decisões.

---

## 🛠️ Tecnologias Utilizadas

### **Frontend**
- **[ReactJS](https://react.dev/):** Biblioteca para construção da interface de usuário.
- **[Vite](https://vitejs.dev/):** Build tool de alta performance para o ambiente de desenvolvimento.
- **[Tailwind CSS](https://tailwindcss.com/):** Framework CSS utilitário para estilização e responsividade.

### **Backend & Database (BaaS)**
- **[Supabase](https://supabase.com/):**
  - **PostgreSQL Database:** Banco de dados relacional para gerenciar tabelas de veículos, viagens e manutenções.
  - **Supabase Auth:** Gerenciamento de usuários e controle de sessões.
  - **Row Level Security (RLS):** Garantia de isolamento dos dados de cada empresa/frota direto no banco.
  - **Storage:** Armazenamento de comprovantes, notas fiscais de manutenção e fotos de veículos.

---

## 🚀 Como Executar o Projeto

### **Pré-requisitos**

Certifique-se de ter instalado em sua máquina:
- [Node.js](https://nodejs.org/) (versão LTS recomendada)
- [npm](https://www.npmjs.com/) ou [yarn](https://yarnpkg.com/)
- Uma conta ativa ou projeto criado no [Supabase](https://supabase.com/)

### **Passo a Passo**

1. **Clone o repositório:**
   ```bash
   git clone [https://github.com/seu-usuario/nome-do-repositorio.git](https://github.com/gustavo-sdc/transport-management.git)
   cd transport-management
   
2. **Configure o arquivo .env**
   - Use as API's Keys do Supabase para conectar ao banco de dados.
   - Fragmento do código:
      VITE_SUPABASE_URL=[https://seu-projeto.supabase.co](https://seu-projeto.supabase.co)
      VITE_SUPABASE_ANON_KEY=sua-chave-anonima-aqui

3. **Inicie o servidor**
   npm run dev



***OBS: PROJETO EM DESENVOLVIMENTO***
     
