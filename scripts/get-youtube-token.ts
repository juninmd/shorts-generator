import { google } from 'googleapis';
import http from 'http';
import url from 'url';
import dotenv from 'dotenv';

dotenv.config();

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

// Substitua com seus IDs caso não estejam no .env
const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('❌ ERRO: Por favor, adicione YOUTUBE_CLIENT_ID e YOUTUBE_CLIENT_SECRET no seu arquivo .env antes de executar este script.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  REDIRECT_URI
);

const scopes = [
  'https://www.googleapis.com/auth/youtube.upload'
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
  prompt: 'consent' // Garante que o refresh_token seja gerado
});

console.log('🤖 Assistente do YouTube (por Antigravity)\n');
console.log('1. Clique neste link para autorizar o aplicativo na sua conta Google:');
console.log(authUrl);
console.log('\n2. Depois de autorizar, a página será redirecionada para localhost.');
console.log('⏳ Aguardando redirecionamento na porta ' + PORT + '...');

const server = http.createServer(async (req, res) => {
  try {
    const queryObject = url.parse(req.url as string, true).query;

    if (queryObject.code) {
      const code = queryObject.code as string;
      const { tokens } = await oauth2Client.getToken(code);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>✅ Sucesso!</h1><p>Você pode fechar esta aba e voltar para o terminal.</p>');

      console.log('\n🎉 Autorização concluída com sucesso!');
      console.log('\n======================================================');
      console.log('📝 COPIE O TOKEN ABAIXO E COLOQUE NO SEU ARQUIVO .env:');
      console.log(`YOUTUBE_REFRESH_TOKEN="${tokens.refresh_token}"`);
      console.log('======================================================\n');
      console.log('Se o token vier como `undefined`, isso significa que o Google não gerou um novo (geralmente porque você já autorizou antes sem revogar o acesso). Neste caso, revogue o acesso do app nas configurações da sua Conta Google e execute este script novamente.');
      
      server.close(() => process.exit(0));
    } else {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Código não encontrado na URL.');
    }
  } catch (error) {
    console.error('❌ Erro inesperado:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Ocorreu um erro.');
  }
});

server.listen(PORT, () => {});
