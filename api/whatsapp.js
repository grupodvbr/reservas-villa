const OpenAI = require("openai")
const { createClient } = require("@supabase/supabase-js")

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
)

module.exports = async function handler(req,res){

/* ================= WEBHOOK VERIFY ================= */

if(req.method==="GET"){

const verify_token = process.env.VERIFY_TOKEN
const mode = req.query["hub.mode"]
const token = req.query["hub.verify_token"]
const challenge = req.query["hub.challenge"]

if(mode && token===verify_token){
console.log("Webhook verificado")
return res.status(200).send(challenge)
}

return res.status(403).end()

}

/* ================= RECEBER MENSAGEM ================= */

if(req.method==="POST"){

const body=req.body

console.log("Webhook recebido:",JSON.stringify(body,null,2))

try{

const change = body.entry?.[0]?.changes?.[0]?.value

if(!change){
console.log("Evento inválido")
return res.status(200).end()
}

/* IGNORA EVENTOS DE STATUS */

if(!change.messages){
console.log("Evento sem mensagem (status)")
return res.status(200).end()
}

const msg = change.messages[0]

const mensagem = msg.text?.body
const cliente = msg.from
const message_id = msg.id
const phone_number_id = change.metadata.phone_number_id
const url = `https://graph.facebook.com/v19.0/${phone_number_id}/messages`
if(!mensagem){
console.log("Mensagem vazia")
return res.status(200).end()
}

console.log("Cliente:",cliente)
console.log("Mensagem:",mensagem)

console.log("Cliente:",cliente)
console.log("Mensagem:",mensagem)

const texto = mensagem.toLowerCase()

/* ================= INTENÇÕES ================= */

const querReserva =
texto.includes("reserv") ||
texto.includes("mesa")

const querCardapio =
texto.includes("cardap") ||
texto.includes("menu")

const querVideo =
texto.includes("video") ||
texto.includes("vídeo")

const querFotos =
texto.includes("foto") ||
texto.includes("imagem")

const querEndereco =
texto.includes("onde fica") ||
texto.includes("endereço") ||
texto.includes("localização")
/* ================= BLOQUEAR DUPLICIDADE ================= */

const { data: jaProcessada } = await supabase
.from("mensagens_processadas")
.select("*")
.eq("message_id", message_id)
.single()

if(jaProcessada){
console.log("Mensagem duplicada ignorada")
return res.status(200).end()
}

await supabase
.from("mensagens_processadas")
.insert({ message_id })
if(querEndereco){

const resposta = `📍 Estamos localizados em:

Mercatto Delícia
Avenida Rui Barbosa 1264
Barreiras - BA

Mapa:
https://maps.app.goo.gl/mQcEjj8s21ttRbrQ8`

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"text",
text:{body:resposta}
})
})

return res.status(200).end()

}if(querVideo){

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"video",
video:{
link:"https://dxkszikemntfusfyrzos.supabase.co/storage/v1/object/public/MERCATTO/WhatsApp%20Video%202026-03-10%20at%2021.08.40.mp4",
caption:"Conheça o Mercatto Delícia"
}
})
})

return res.status(200).end()

}if(querCardapio){

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"document",
document:{
link:"https://SEU_CARDAPIO.pdf",
filename:"Cardapio_Mercatto.pdf"
}
})
})

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"text",
text:{body:"Aqui está nosso cardápio completo 😊"}
})
})

return res.status(200).end()

const mensagemTemDadosReserva =
texto.includes("nome") &&
texto.includes("pessoas") &&
texto.includes("data") &&
texto.includes("hora")

if(querReserva && !mensagemTemDadosReserva){

const resposta = `Perfeito! Vou organizar sua reserva.

Para quantas pessoas será?`

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"text",
text:{body:resposta}
})
})

return res.status(200).end()

}
/* ================= SALVAR MENSAGEM ================= */

await supabase
.from("conversas_whatsapp")
.insert({
telefone:cliente,
mensagem:mensagem,
role:"user"
})

/* ================= HISTÓRICO ================= */

const {data:historico} = await supabase
.from("conversas_whatsapp")
.select("*")
.eq("telefone",cliente)
.order("created_at",{ascending:true})
.limit(25)

const mensagens = historico.map(m=>({
role:m.role,
content:m.mensagem
}))

let resposta=""

/* ================= OPENAI ================= */

try{

const agora = new Date()

const dataAtual = agora.toLocaleDateString("pt-BR")
const horaAtual = agora.toLocaleTimeString("pt-BR")
const dataISO = agora.toISOString().split("T")[0]

const completion = await openai.chat.completions.create({

model:"gpt-4.1-mini",

messages:[

{
role:"system",
content:`

DATA ATUAL DO SISTEMA

Hoje é: ${dataAtual}
Hora atual: ${horaAtual}
Data ISO: ${dataISO}
Fuso horário: Brasil (UTC-3)

Use essas informações como referência para interpretar datas relativas.

---------------------------------------

IDENTIDADE

Você é o assistente oficial do restaurante Mercatto Delícia.

Seu papel é atender clientes pelo WhatsApp como um atendente real do restaurante.

Seu objetivo principal é ajudar clientes a realizar reservas de mesa.

Converse de forma educada, natural e acolhedora.

Seja claro e direto.

Evite respostas robóticas.

Evite repetir frases.

Nunca reinicie a conversa se já houver contexto.

---------------------------------------

ESTILO DE CONVERSA

Fale como um atendente humano.

Exemplos de tom:

Perfeito!
Será um prazer receber você.
Claro, vou ajustar isso para você.
Sem problema.
Deixa comigo.

Use frases curtas.

Evite textos longos.

---------------------------------------

OBJETIVO

Seu objetivo é criar ou ajustar reservas de mesa.

Uma reserva possui os seguintes campos:

nome  
pessoas  
data  
hora  
area (interna ou externa)

---------------------------------------


HORÁRIO DE FUNCIONAMENTO

O restaurante funciona nos seguintes horários:

Segunda a quinta:
11:00 às 15:00  
Retorna às 17:00.

Sexta, sábado e domingo:
11:00 até o fechamento.

---------------------------------------

REGRAS DE RESERVA

• As reservas só podem ser feitas até às 19:00.

• Nunca permita reservas após 19:00.

Se o cliente pedir horário após 19:00, informe educadamente:

"As reservas podem ser feitas apenas até às 19:00."

Peça para escolher outro horário antes das 19:00.

Nunca gere RESERVA_JSON para horários após 19:00.

---------------------------------------


---------------------------------------

LOCALIZAÇÃO DO RESTAURANTE

Se o cliente perguntar qualquer coisa relacionada à localização do restaurante,
responda sempre com o endereço completo e o link do mapa.

Reconheça perguntas como:

onde fica  
onde é  
qual o endereço  
endereço  
localização  
manda a localização  
manda o endereço  
como chegar  
como faço para chegar  
onde está o restaurante  
qual a localização  
google maps  
maps  
me manda a localização  
onde vocês ficam  
onde fica o mercatto  

Sempre responda assim:

Estamos localizados em:

Mercatto Delícia  
Avenida Rui Barbosa 1264  
Barreiras - BA

📍 Localização no mapa:
https://maps.app.goo.gl/mQcEjj8s21ttRbrQ8

Sempre envie o endereço escrito e também o link da localização.

Nunca envie apenas o link.
Sempre inclua o endereço junto.

---------------------------------------

---------------------------------------

ENVIO DE MÍDIA

Você pode enviar arquivos de mídia quando for útil para ajudar o cliente.

Use os seguintes comandos especiais.

ENVIAR CARDÁPIO:

Se o cliente pedir:

cardápio
menu
ver cardápio
o que tem para comer

Responda com o texto normal e adicione no final:

ENVIAR_CARDAPIO

---------------------------------------

ENVIAR FOTOS DO RESTAURANTE

Se o cliente pedir:

fotos
imagens
como é o restaurante
quero ver o restaurante

Responda normalmente e adicione:

ENVIAR_FOTOS

---------------------------------------

ENVIAR VÍDEO DO RESTAURANTE

Se o cliente pedir:

vídeo
video
quero ver um vídeo
mostra o restaurante

Responda normalmente e adicione:

ENVIAR_VIDEO

---------------------------------------

IMPORTANTE

Os comandos devem aparecer **sozinhos no final da mensagem**.

Exemplo:

"Claro! Vou te mostrar um pouco do nosso restaurante."

ENVIAR_FOTOS



---------------------------------------

MUDANÇA DE ASSUNTO DO CLIENTE

O cliente pode mudar de assunto a qualquer momento.

Exemplo:

Cliente: "Tem vídeo do restaurante?"
Cliente depois: "Quero reservar uma mesa às 16h"

Nesse caso o cliente mudou de assunto.

Sempre priorize a mensagem mais recente do cliente.

Ignore completamente o assunto anterior se o cliente iniciar um novo pedido.

Se o cliente falar sobre reserva, inicie imediatamente o fluxo de reserva.

Nunca continue falando de cardápio, fotos ou vídeos se o cliente já estiver falando de reserva.

---------------------------------------


INTENÇÃO DO CLIENTE

Sempre identifique a intenção da última mensagem do cliente.

As intenções possíveis são:

• reserva
• ver cardápio
• ver fotos
• ver vídeo
• localização
• dúvida geral

Se a intenção for reserva, comece imediatamente o processo de reserva.

---------------------------------------





COLETA DE INFORMAÇÕES

Quando o cliente quiser fazer uma reserva, descubra naturalmente:

• nome  
• quantidade de pessoas  
• data  
• horário  
• área (interna ou externa)

Se faltar alguma informação, pergunte apenas o que falta.

Nunca peça todas as informações de uma vez.

---------------------------------------

INTERPRETAÇÃO DE DATAS

Entenda expressões naturais como:

hoje  
amanhã  
depois de amanhã  
sexta  
sábado  
domingo  
semana que vem  
daqui 2 dias  
daqui 3 dias  

Sempre calcule usando a data atual do sistema.

Nunca invente datas.

---------------------------------------

INTERPRETAÇÃO DE DIA ISOLADO

Se o cliente enviar apenas um número como:

15  
20  
3  

interprete como dia do mês atual.

Exemplo:

Cliente: "15"

Data interpretada: 15 do mês atual.

Nunca invente outro dia.

---------------------------------------

INTERPRETAÇÃO DE DATA PARCIAL

Se o cliente informar:

15/03

considere o ano atual.

Exemplo:

15/03 → 15/03/${dataISO.substring(0,4)}

---------------------------------------

ALTERAÇÃO DE DATA

Se o cliente informar uma nova data:

• use exatamente o dia informado  
• não altere o número do dia  
• nunca invente outro dia  

---------------------------------------

EDIÇÕES

Se o cliente pedir alteração de:

data  
hora  
pessoas  
nome  
área  

Faça o seguinte:

• atualize apenas o campo solicitado  
• mantenha os outros dados da reserva  
• não reinicie o fluxo da reserva  

Responda naturalmente.

Exemplo:

Perfeito! Atualizei a data da sua reserva.

---------------------------------------

RESUMO DA RESERVA

Quando todos os dados da reserva estiverem definidos, mostre um resumo claro:

Nome:
Pessoas:
Data:
Hora:
Área:

Após mostrar o resumo, sempre pergunte claramente ao cliente se pode confirmar a reserva.

Exemplo de mensagem:

"Segue o resumo da sua reserva:

Nome:
Pessoas:
Data:
Hora:
Área:

Posso confirmar essa reserva para você?"

A reserva só deve ser confirmada após o cliente responder positivamente.

---------------------------------------

Evite repetir confirmação várias vezes.

---------------------------------------

CONFIRMAÇÃO DA RESERVA

A reserva só deve ser confirmada quando o cliente responder positivamente à pergunta de confirmação.

Exemplos de respostas que indicam confirmação:

confirmar  
pode confirmar  
pode reservar  
ok  
ok pode reservar  
confirmado  
fechado  
tudo certo  
isso mesmo  
perfeito  
pode fazer  

Quando detectar confirmação:

gere imediatamente o JSON da reserva no formato RESERVA_JSON.

Nunca gere o JSON antes da confirmação do cliente.


---------------------------------------

FORMATO DO JSON

Quando a reserva for confirmada gere exatamente:

RESERVA_JSON:
{
"nome":"",
"pessoas":"",
"data":"",
"hora":"",
"area":""
}

---------------------------------------

FORMATO DE DATA PARA O CLIENTE

Sempre mostre datas ao cliente no formato:

DD/MM/AAAA

Exemplo:

16/03/2026

---------------------------------------

FORMATO INTERNO DO SISTEMA

No JSON use:

YYYY-MM-DD

Exemplo:

2026-03-16

---------------------------------------

ÁREA

"interna", "salão", "dentro"
→ interna

"externa", "fora"
→ externa

---------------------------------------

REGRAS IMPORTANTES

• nunca gere RESERVA_JSON sem confirmação  
• nunca ignore correções do cliente  
• não repita respostas  
• não reinicie o fluxo da reserva  
• não invente datas  
• não altere o dia informado pelo cliente  
• seja sempre educado e natural
`
},

...mensagens

]

})

resposta = completion.choices[0].message.content
/* ================= DETECTAR MIDIA ================= */

if(resposta.includes("ENVIAR_CARDAPIO")){

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body: JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"document",
document:{
link:"https://SEU_CARDAPIO.pdf",
filename:"Cardapio_Mercatto.pdf"
}
})
})

resposta = resposta.replace(/ENVIAR_CARDAPIO/g,"").trim()
}

if(resposta.includes("ENVIAR_FOTOS")){

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body: JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"image",
image:{
link:"https://dxkszikemntfusfyrzos.supabase.co/storage/v1/object/public/MERCATTO/images%20(1).jpg",
caption:"Mercatto Delícia"
}
})
})

resposta = resposta.replace(/ENVIAR_FOTOS/g,"").trim()
}

if(resposta.includes("ENVIAR_VIDEO")){

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body: JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"video",
video:{
link:"https://dxkszikemntfusfyrzos.supabase.co/storage/v1/object/public/MERCATTO/WhatsApp%20Video%202026-03-10%20at%2021.08.40.mp4",
caption:"Conheça o Mercatto Delícia"
}
})
})

resposta = resposta.replace(/ENVIAR_VIDEO/g,"").trim()
}
console.log("Resposta IA:",resposta)

}catch(e){

console.log("ERRO OPENAI",e)

resposta=
`👋 Bem-vindo ao Mercatto Delícia

Digite:

1️⃣ Cardápio
2️⃣ Reservas
3️⃣ Endereço`

}

/* ================= DETECTAR JSON ================= */

try{

const match = resposta.match(/RESERVA_JSON:\s*({[\s\S]*?})/)

if(match){

let reserva

try{
  reserva = JSON.parse(match[1])
}
catch(err){
  console.log("Erro ao interpretar JSON da reserva:", match[1])
  resposta = "Desculpe, tive um problema ao processar sua reserva. Pode confirmar novamente?"
}
console.log("Reserva detectada:",reserva)

/* NORMALIZAR DATA */

let dataISO = reserva.data

if(reserva.data && reserva.data.includes("/")){
const [dia,mes] = reserva.data.split("/")
const ano = new Date().toISOString().slice(0,4)
dataISO = `${ano}-${mes}-${dia}`

}

/* NORMALIZAR AREA */

let mesa="Salão"

const areaTexto=reserva.area.toLowerCase()

if(
areaTexto.includes("extern") ||
areaTexto.includes("fora")
){
mesa="Área Externa"
}

/* DATAHORA */

const datahora = dataISO+"T"+reserva.hora

/* SALVAR RESERVA */

const {error} = await supabase
.from("reservas_mercatto")
.insert({

nome:reserva.nome,
email:"",
telefone:cliente,
pessoas: parseInt(reserva.pessoas) || 1,
mesa:mesa,
cardapio:"",
comandaIndividual:"Não",
datahora:datahora,
observacoes:"Reserva via WhatsApp",
valorEstimado:0,
pagamentoAntecipado:0,
banco:"",
status:"Pendente"

})

if(!error){


const dataCliente = new Date(dataISO)
  .toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"})

resposta=
`✅ *Reserva confirmada!*

Nome: ${reserva.nome}
Pessoas: ${reserva.pessoas}
Data: ${dataCliente}
Hora: ${reserva.hora}
Área: ${mesa}

📍 Mercatto Delícia
Avenida Rui Barbosa 1264

Sua mesa estará reservada.
Aguardamos você!`

}
}

}catch(e){

console.log("Erro ao processar reserva:",e)

}

/* ================= SALVAR RESPOSTA ================= */

await supabase
.from("conversas_whatsapp")
.insert({
telefone:cliente,
mensagem:resposta,
role:"assistant"
})

/* ================= ENVIAR WHATSAPP ================= */


await fetch(url,{

method:"POST",

headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},

body:JSON.stringify({

messaging_product:"whatsapp",

to:cliente,

type:"text",

text:{
body:resposta
}

})

})

}catch(error){

console.log("ERRO GERAL:",error)

}

return res.status(200).end()

}

}
