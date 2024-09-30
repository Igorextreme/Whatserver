// Importar bibliotecas necessárias
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { GoogleAIFileManager } = require('@google/generative-ai/server');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

// Configurar o servidor Express e WebSocket
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configurar as chaves da API do Gemini
const GEMINI_API_KEY = 'AIzaSyA1PwVsVYDTgT65ozZ87A6bq5CGv9aEuLA';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  systemInstruction: "Perfil do Bot:\n\nO bot é um especialista em Pokémon com conhecimento abrangente sobre todas as gerações, tipos, evoluções, estratégias de batalha, jogos, séries de TV e filmes da franquia Pokémon.\nComportamento em relação a perguntas fora do tema:\n\nSe o usuário fizer perguntas que não estejam relacionadas a Pokémon, o bot redirecionará a conversa de volta ao tema Pokémon com uma resposta como: \"Entendo que você tenha interesse em [outro assunto], mas meu foco é Pokémon. Posso ajudar com algo relacionado a eles?\"\nSe o usuário insistir em perguntar sobre outros assuntos, o bot responderá de forma clara: \"Desculpe, mas eu só posso responder perguntas sobre Pokémon. O que você gostaria de saber sobre eles?\"\nEstratégia de Redirecionamento:\n\nO bot sugerirá tópicos interessantes dentro do universo Pokémon para guiar o usuário de volta ao tema, como: \"Sabia que existem mais de 800 Pokémon diferentes? Posso te ajudar a escolher um para a sua equipe!\"\nO bot fará perguntas direcionadas, como \"Você já explorou as estratégias de batalha com Pokémon do tipo Fogo?\" para estimular o usuário a falar sobre Pokémon.\nInteração Geral:\n\nSempre encoraje o usuário a continuar a conversa sobre Pokémon com frases como: \"Posso te ajudar a entender as melhores combinações de tipos de Pokémon?\" ou \"Há alguma dúvida sobre a evolução de um Pokémon específico que eu possa esclarecer?\"\nO bot é paciente e oferece explicações detalhadas sobre Pokémon para garantir que o usuário se sinta assistido e compreendido.\nTom e Estilo de Resposta:\n\nMantenha um tom amigável, divertido e entusiasmado ao falar sobre Pokémon.\nSeja sempre claro e evite usar jargões complexos sem oferecer explicações, a menos que o usuário já demonstre conhecimento avançado.\n",
});

const generationConfig = {
  temperature: 0,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

// Armazena sessões de chat por usuário
const chatSessions = {};

// Inicializar o cliente WhatsApp
const client = new Client({
  authStrategy: new LocalAuth()
});

// Quando o QR code é gerado, exibi-lo no terminal
client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
});

// Quando o cliente estiver pronto, exibir uma mensagem
client.on('ready', () => {
  console.log('Bot está pronto!');
});

// Evento que será disparado ao receber uma mensagem
client.on('message', async (message) => {
  console.log(`Mensagem recebida de ${message.from}: ${message.body}`);

  // Evitar que o bot responda a si mesmo ou a mensagens vazias
  if (message.fromMe || (!message.body && !message.hasMedia)) return;

  try {
    // Processar mensagens com mídia (imagem)
    if (message.hasMedia) {
      const media = await message.downloadMedia();
      const filePath = `./uploads/${message.from}_image.jpg`;
      
      // Salvar a imagem
      fs.writeFileSync(filePath, media.data, 'base64');

      // Fazer upload da imagem para o Gemini
      const uploadResult = await fileManager.uploadFile(filePath, {
        mimeType: media.mimetype,
        displayName: `Imagem de ${message.from}`
      });


// Obter uma resposta do modelo com base na imagem
const result = await model.generateContent([
  "Você é um especialista em Pokémon. Imagine que Voce tem uma pokedex dentro de voce com todas as imagens detalhes corest habitates etc. Voce conhece todos os Pomemons so de olhar como se fosse a propria pokedex. Analise a imagem fornecida de forma detalhada e precisa. Considere os seguintes aspectos para identificar corretamente o Pokémon: cor principal, padrões de cor, formato do corpo, tipo de orelha, formato dos olhos, presença de cauda e suas características, detalhes das patas, além de elementos específicos como chamas, folhas, raios, conchas ou espinhos. Compare cuidadosamente a imagem com todos os Pokémon conhecidos e forneça os três mais prováveis, mencionando em detalhes por que cada um deles pode ser a melhor opção. Se possível, inclua informações sobre o tipo de Pokémon (água, fogo, planta, etc.), habilidades, evoluções e qualquer característica que ajude a confirmar a identificação. Seja o mais preciso e cuidadoso possível, e evite suposições.",
  {
    fileData: {
      fileUri: uploadResult.file.uri,
      mimeType: uploadResult.file.mimeType,
    },
  },
]);

      const responseText = result.response.text();
      await message.reply(responseText);
      console.log(`Resposta enviada para ${message.from}: ${responseText}`);

      // Excluir a imagem após o processamento
      fs.unlinkSync(filePath);
    } else {
      // Processar mensagens de texto
      let chatSession = chatSessions[message.from];

      if (!chatSession) {
        chatSession = model.startChat({
          generationConfig,
          history: [],
        });
        chatSessions[message.from] = chatSession;
      }

      // Enviar a mensagem para a API do Gemini
      const result = await chatSession.sendMessage(message.body);
      const responseText = result.response.text();

      // Enviar a resposta para o remetente no WhatsApp
      await message.reply(responseText);
      console.log(`Resposta enviada para ${message.from}: ${responseText}`);
    }
  } catch (error) {
    console.error('Erro ao processar a mensagem:', error);
    message.reply('Desculpe, ocorreu um erro ao processar sua mensagem.');
  }
});

// Função de Keep-Alive para manter o WebSocket ativo
wss.on('connection', (ws) => {
  console.log('Nova conexão WebSocket estabelecida');
  const keepAliveInterval = setInterval(() => {
    ws.send('ping');
    console.log('Ping enviado para manter o bot ativo');
  }, 30000);

  ws.on('close', () => {
    clearInterval(keepAliveInterval);
    console.log('Conexão WebSocket encerrada');
  });
});

// Rota básica para verificar se o bot está ativo
app.get('/', (req, res) => {
  res.send('Bot está ativo!');
});

// Configurar reconexão automática
setInterval(() => {
  console.log('Reconectando o WhatsApp Web...');
  client.destroy().then(() => {
    client.initialize();
  }).catch(error => {
    console.error('Erro ao tentar reconectar o WhatsApp:', error);
  });
}, 600000); // A cada 10 minutos

// Iniciar o cliente WhatsApp
client.initialize();

// Configurar a porta do servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor WebSocket rodando na porta ${PORT}`);
});
