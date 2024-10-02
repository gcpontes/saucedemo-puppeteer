const puppeteer = require("puppeteer");
const fs = require("fs");
const express = require("express");
const { timeout } = require("puppeteer");
const app = express();
const PORTA = 3000;
const tempoLimite = 20000;

app.get("/saucedemo", async (req, res) => {
  let navegador;
  const resultadosLogin = [];

  try {
    navegador = await inicializarNavegador();
    let page = await navegador.newPage();

    await navegarParaPageLogin(page);
    console.log("Página carregada, capturando logins disponíveis...");

    const logins = await obterLogins(page);
    console.log("Logins capturados:", logins);

    for (const login of logins) {
      const resultado = await processarLogin(page, login);
      resultadosLogin.push(resultado);

      await page.close();
      page = await navegador.newPage();
      await navegarParaPageLogin(page);
    }
  } catch (erro) {
    console.error("Erro durante o processo:", erro.message);
    res.status(500).json({ status: "error", message: erro.message });
  } finally {
    if (navegador) {
      await navegador.close();
    }
    salvarResultadosNoArquivo(resultadosLogin);
    res.json({ status: "success", resultadosLogin });
    console.log("Resultados salvos no arquivo loginResults.json");
    console.log("Processo finalizado.");
  }
});

async function inicializarNavegador() {
  return await puppeteer.launch({ headless: true, slowMo: 0 });
}

async function navegarParaPageLogin(page) {
  await page.goto("https://www.saucedemo.com/", {
    waitUntil: "domcontentloaded",
  });
}

async function obterLogins(page) {
  return await page.evaluate(() => {
    const infoLogin = document.querySelector(".login_credentials").innerText;
    const listaLogins = infoLogin
      .split("\n")
      .map((login) => login.trim())
      .filter(Boolean);
    return listaLogins;
  });
}

async function processarLogin(page, login) {
  
  const mensagemErro = await realizarLogin(page, login);

  let statusLogin;
  let mensagem;
  let comparacaoFinal = [];
  let produtoMaisCaroLista = null;
  let produtoMaisCaroDetalhe = null;
  

  if (mensagemErro) {
    statusLogin = "failed";
    mensagem = mensagemErro;
    console.log("Mensagem de erro capturada:", mensagemErro);
  } else {
    statusLogin = "success";
    mensagem = "Login realizado com sucesso ou nenhum erro encontrado.";
    console.log("Login realizado com sucesso ou nenhum erro encontrado.");
  }

  if (page.url() === "https://www.saucedemo.com/inventory.html") {
    const listaProdutos = await obterListaProdutos(page);
    produtoMaisCaroLista = encontrarProdutoMaisCaro(listaProdutos);

    comparacaoFinal = await compararProdutos(page, listaProdutos);
    produtoMaisCaroDetalhe = encontrarProdutoMaisCaroDetalhe(comparacaoFinal);

    await realizarLogout(page, login);
  } else {
    const mensagemErro = await page.evaluate(() => {
      const elementoErro = document.querySelector('[data-test="error"]');
      return elementoErro ? elementoErro.innerText : "Nenhuma mensagem de erro";
    });
    console.log(
      `Falha no login com o usuário: ${login} | Mensagem de erro: ${mensagemErro}`
    );
  }

  return {
    usuario: login,
    status: statusLogin,
    mensagem: mensagem,
    produtoMaisCaroLista,
    produtoMaisCaroDetalhe,
    comparacaoProdutos: comparacaoFinal,
  };
}

async function realizarLogin(page, login) {
  const senha = "secret_sauce";
  console.log(`Tentando login com usuário: ${login}`);

  await page.evaluate(() => {
    document.querySelector("#user-name").value = "";
  });
  await page.type("#user-name", login);

  await page.evaluate(() => {
    document.querySelector("#password").value = "";
  });
  await page.type("#password", senha);

  await page.click("#login-button");

  const mensagemErro = await page.evaluate(() => {
    const elementoErro = document.querySelector('[data-test="error"]');
    return elementoErro ? elementoErro.innerText : null;
  });

  console.log(`Login bem-sucedido com o usuário: ${login}`);

  return mensagemErro;
}

async function obterListaProdutos(page) {
  return await page.evaluate(() => {
    const produtos = [];
    document.querySelectorAll(".inventory_item").forEach((produto) => {
      const nome = produto.querySelector(".inventory_item_name").innerText;
      const preco = produto.querySelector(".inventory_item_price").innerText;
      const id = produto.querySelector("a").id.match(/\d+/)[0];
      const seletor = `#item_${id}_title_link`;
      produtos.push({ nome, preco, seletor });
    });
    return produtos;
  });
}

function encontrarProdutoMaisCaro(produtos) {
  return produtos.reduce(
    (max, produto) => {
      const preco = produto.preco
        ? parseFloat(produto.preco.replace("$", ""))
        : 0;
      return preco > max.preco ? { nome: produto.nome, preco } : max;
    },
    { preco: 0 }
  );
}

async function compararProdutos(page, listaProdutos) {
  const comparacaoFinal = [];

  for (const produto of listaProdutos) {
    console.log(`Acessando a página do produto: ${produto.nome}`);
    const seletor = produto.seletor;
    let sucesso = false;

    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      try {
        await acessarPaginaProduto(page, seletor, produto.nome);
        const detalhesProduto = await obterDetalhesProduto(page);
        const comparacao = criarComparacaoProduto(produto, detalhesProduto);

        comparacaoFinal.push(comparacao);
        console.log(
          `Comparação do produto: ${JSON.stringify(comparacao, null, 2)}`
        );

        await retornarListaProdutos(page, produto.nome);
        sucesso = true;
        break;
      } catch (erro) {
        console.log(seletor, `Erro na tentativa ${tentativa}:`, erro.message);
        if (tentativa === 4) {
          console.log(`Falha ao acessar ${produto.nome} após 4 tentativas.`);
          comparacaoFinal.push(criarComparacaoFalha(produto, erro.message));
        }
      }
    }

    if (
      !sucesso &&
      !comparacaoFinal.some((item) => item.nomeProdutoLista === produto.nome)
    ) {
      comparacaoFinal.push(
        criarComparacaoFalha(produto, "Falha após 4 tentativas")
      );
    }
  }

  return comparacaoFinal;
}

async function acessarPaginaProduto(page, seletor, nomeProduto) {
  console.log(`Tentativa para acessar ${nomeProduto}`);
  console.log("Esperando o seletor", seletor);
  await page.waitForSelector(seletor, { timeout: tempoLimite });

  if (page.isClosed()) {
    throw new Error("Frame foi fechado");
  }

  await page.$eval(seletor, (element) => element.click());
  console.log(`Acessando a página do produto: ${nomeProduto}`);
  await page.waitForSelector(".inventory_details_name", {
    timeout: tempoLimite,
  });
}

async function obterDetalhesProduto(page) {
  return await page.evaluate(() => {
    const nome = document.querySelector(".inventory_details_name").innerText;
    const preco = document.querySelector(".inventory_details_price").innerText;
    return { nome, preco };
  });
}

function criarComparacaoProduto(produto, detalhesProduto) {
  return {
    nomeProdutoLista: produto.nome,
    precoProdutoLista: produto.preco,
    nomeProdutopageDetalhe: detalhesProduto.nome,
    precoProdutopageDetalhe: detalhesProduto.preco,
    nomeIgual: produto.nome === detalhesProduto.nome,
    precoIgual: produto.preco === detalhesProduto.preco,
  };
}

async function retornarListaProdutos(page, nomeProduto) {
  console.log(`Retornando à lista de produtos: ${nomeProduto}`);
  await page.waitForSelector("#back-to-products", { timeout: tempoLimite });
  await page.$eval("#back-to-products", (element) => element.click());
}

function criarComparacaoFalha(produto, mensagemErro) {
  return {
    nomeProdutoLista: produto.nome,
    precoProdutoLista: produto.preco,
    nomeProdutopageDetalhe: null,
    precoProdutopageDetalhe: null,
    nomeIgual: false,
    precoIgual: false,
    erro: `Falha após 4 tentativas: ${mensagemErro}`,
  };
}

function encontrarProdutoMaisCaroDetalhe(comparacoes) {
  return comparacoes.reduce(
    (max, comparacao) => {
      const preco = comparacao.precoProdutopageDetalhe
        ? parseFloat(comparacao.precoProdutopageDetalhe.replace("$", ""))
        : 0;
      return preco > max.preco
        ? { nome: comparacao.nomeProdutopageDetalhe, preco }
        : max;
    },
    { preco: 0 }
  );
}

async function realizarLogout(page, login) {
  await page.$eval("#react-burger-menu-btn", (element) => element.click());
  await page.$eval("#logout_sidebar_link", (element) => element.click());
}

async function salvarResultadosNoArquivo(resultados) {
  fs.writeFileSync("loginResults.json", JSON.stringify(resultados, null, 2));
}

app.listen(PORTA, () => {
  console.log(
    `Servidor rodando na porta ${PORTA}. Acesse http://localhost:${PORTA}/saucedemo para testar.`
  );
});
