const puppeteer = require("puppeteer");
const fs = require("fs");
const express = require("express");
const app = express();
const PORT = 3000;

function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

async function initializeBrowser() {
  return await puppeteer.launch({ headless: true, slowMo: 0 });
}

async function navigateToLoginPage(page) {
  await page.goto("https://www.saucedemo.com/", {
    waitUntil: "networkidle2",
  });
}

async function getLogins(page) {
  return await page.evaluate(() => {
    const loginInfo = document.querySelector(".login_credentials").innerText;
    const loginList = loginInfo
      .split("\n")
      .map((login) => login.trim())
      .filter(Boolean);
    return loginList;
  });
}

async function performLogin(page, login, password) {
  console.log(`Tentando login com usuário: ${login}`);

  await page.evaluate(() => {
    document.querySelector("#user-name").value = "";
  });
  await page.type("#user-name", login);

  await page.evaluate(() => {
    document.querySelector("#password").value = "";
  });
  await page.type("#password", password);

  await page.click("#login-button");

  const errorMessage = await page.evaluate(() => {
    const errorElement = document.querySelector('[data-test="error"]');
    return errorElement ? errorElement.innerText : null;
  });

  console.log(`Login bem-sucedido com o usuário: ${login}`);

  return errorMessage;
}

async function handleLogout(page, login) {
  await page.evaluate(() => {
    const button = document.querySelector("#react-burger-menu-btn");
    if (button) {
      button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  });

  await page.evaluate(() => {
    const button = document.querySelector("#logout_sidebar_link");
    if (button) {
      button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  });
}

async function saveResultsToFile(results) {
  fs.writeFileSync("loginResults.json", JSON.stringify(results, null, 2));
}

function findMostExpensiveProduct(products) {
  return products.reduce(
    (max, product) => {
      const price = parseFloat(product.price.replace("$", ""));
      return price > max.price ? { ...product, price } : max;
    },
    { price: 0 }
  );
}

app.get("/sauce-demo", async (req, res) => {
  let browser;
  const loginResults = [];

  try {
    browser = await initializeBrowser();
    let page = await browser.newPage();

    await navigateToLoginPage(page);
    console.log("Página carregada, capturando logins disponíveis...");

    const logins = await getLogins(page);
    console.log("Logins capturados:", logins);

    const password = "secret_sauce";

    for (const login of logins) {
      const errorMessage = await performLogin(page, login, password);

      let loginStatus;
      let message;
      let finalComparison = [];
      let mostExpensiveListProduct = null;
      let mostExpensiveDetailProduct = null;

      if (errorMessage) {
        loginStatus = "failed";
        message = errorMessage;
        console.log("Mensagem de erro capturada:", errorMessage);
      } else {
        loginStatus = "success";
        message = "Login realizado com sucesso ou nenhum erro encontrado.";
        console.log("Login realizado com sucesso ou nenhum erro encontrado.");
      }

      if (page.url() === "https://www.saucedemo.com/inventory.html") {
        const productsList = await page.evaluate(() => {
          const products = [];
          document.querySelectorAll(".inventory_item").forEach((product) => {
            const name = product.querySelector(
              ".inventory_item_name"
            ).innerText;
            const price = product.querySelector(
              ".inventory_item_price"
            ).innerText;

            const id = product.querySelector("a").id.match(/\d+/)[0];
            const selector = `#item_${id}_title_link`;

            products.push({ name, price, selector });
          });
          return products;
        });

        console.log(
          "Lista de produtos obtida da página inicial:",
          productsList
        );

        mostExpensiveListProduct = findMostExpensiveProduct(productsList);

        for (const product of productsList) {
          console.log(`Acessando a página do produto: ${product.name}`);

          const selector = product.selector;
          let success = false;

          for (let attempt = 1; attempt <= 4; attempt++) {
            try {
              console.log(`Tentativa ${attempt} para acessar ${product.name}`);

              await page.waitForSelector(".inventory_item", { timeout: 1000 });
              await page.waitForSelector(selector, { timeout: 1000 });

              await page.click(selector);

              await page.waitForSelector(".inventory_details_name", {
                timeout: 1000,
              });

              const productDetails = await page.evaluate(() => {
                const name = document.querySelector(
                  ".inventory_details_name"
                ).innerText;
                const price = document.querySelector(
                  ".inventory_details_price"
                ).innerText;
                return { name, price };
              });

              const comparison = {
                productNameList: product.name,
                productPriceList: product.price,
                productNameDetailPage: productDetails.name,
                productPriceDetailPage: productDetails.price,
                nameMatch: product.name === productDetails.name,
                priceMatch: product.price === productDetails.price,
              };

              finalComparison.push(comparison);

              console.log(
                `Comparação do produto: ${JSON.stringify(comparison, null, 2)}`
              );

              await page.evaluate(() => {
                const button = document.querySelector("#back-to-products");
                if (button) {
                  button.dispatchEvent(
                    new MouseEvent("mouseover", { bubbles: true })
                  );
                  button.dispatchEvent(
                    new MouseEvent("mousedown", { bubbles: true })
                  );
                  button.dispatchEvent(
                    new MouseEvent("mouseup", { bubbles: true })
                  );
                  button.dispatchEvent(
                    new MouseEvent("click", { bubbles: true })
                  );
                }
              });

              await page.waitForSelector(".inventory_item", { timeout: 1000 });
              success = true;

              const currentDetailProduct = {
                name: productDetails.name,
                price: parseFloat(productDetails.price.replace("$", "")),
              };

              if (
                !mostExpensiveDetailProduct ||
                currentDetailProduct.price > mostExpensiveDetailProduct.price
              ) {
                mostExpensiveDetailProduct = currentDetailProduct;
              }

              break;
            } catch (error) {
              console.log(
                selector,
                `Erro na tentativa ${attempt}:`,
                error.message
              );
              if (attempt === 4) {
                console.log(
                  `Falha ao acessar ${product.name} após 4 tentativas.`
                );
                finalComparison.push({
                  productNameList: product.name,
                  productPriceList: product.price,
                  productNameDetailPage: null,
                  productPriceDetailPage: null,
                  nameMatch: false,
                  priceMatch: false,
                  error: `Falha após 4 tentativas: ${error.message}`,
                });
              }
            }
          }

          if (
            !success &&
            !finalComparison.some(
              (item) => item.productNameList === product.name
            )
          ) {
            finalComparison.push({
              productNameList: product.name,
              productPriceList: product.price,
              productNameDetailPage: null,
              productPriceDetailPage: null,
              nameMatch: false,
              priceMatch: false,
              error: "Falha após 4 tentativas",
            });
          }
        }

        console.log(
          "Comparação final entre listagem de produtos e página de detalhes:",
          finalComparison
        );

        await handleLogout(page, login);
      } else {
        const errorMessage = await page.evaluate(() => {
          const errorElement = document.querySelector('[data-test="error"]');
          return errorElement
            ? errorElement.innerText
            : "Nenhuma mensagem de erro";
        });
        console.log(
          `Falha no login com o usuário: ${login} | Mensagem de erro: ${errorMessage}`
        );
      }

      loginResults.push({
        username: login,
        status: loginStatus,
        message: message,
        mostExpensiveListProduct,
        mostExpensiveDetailProduct,
        productComparison: finalComparison,        
      });

      await page.close();
      page = await browser.newPage();
      await navigateToLoginPage(page);
    }
  } catch (error) {
    console.error("Erro durante o processo:", error.message);
    res.status(500).json({ status: 'error', message: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
    saveResultsToFile(loginResults);
    res.json({status: 'success', loginResults}); // Send the results as JSON response
  }
});

app.listen(PORT, () => {
  console.log(
    `Servidor rodando na porta ${PORT}. Acesse http://localhost:${PORT}/sauce-demo para testar.`
  );
});
