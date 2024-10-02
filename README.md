# Puppeteer Saucedemo

Este projeto utiliza Puppeteer para automatizar testes no site Saucedemo.


## Explicação da Aplicação

A aplicação realiza as seguintes ações:

1. Acessa o site Saucedemo utilizando todos os logins disponíveis.
2. Navega pela página de todos os produtos.
3. Retorna qual é o produto mais caro de acordo com a lista de produtos.
4. Retorna qual é o produto mais caro de acordo com os detalhes de cada produto.
5. Compara a lista de produtos com os detalhes de cada produto, informando se há diferenças entre eles.


## Instalação

1. Clone o repositório:
    ```bash
    git clone https://github.com/seu-usuario/puppeteer-saucedemo.git
    ```
2. Instale as dependências:
    ```bash
    cd puppeteer-saucedemo
    npm install
    ```

## Uso

Execute o script de teste:
```bash
node index.js
```