const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const NodeCache = require('node-cache');
const http = require('http');

// ✅ SOLUCIÓN PARA RENDER (elimina el mensaje de "No open ports")
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot activo y funcionando');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servicio auxiliar listo en puerto ${PORT}`);
});

// ⚙️ CONFIGURACIÓN
const db = new NodeCache({ stdTTL: 0 });
const OWNER = '573014393977'; // ✅ TU NÚMERO YA CONFIGURADO
const PREFIJO = '!';

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('sesion');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    logger: require('pino')({ level: 'silent' }),
    generateHighQualityLinkPreview: false,
    defaultQueryTimeoutMs: 60000,
    connectTimeoutMs: 60000
  });

  sock.ev.on('creds.update', saveCreds);

  // 📱 CÓDIGO DE VINCULACIÓN DE 8 DÍGITOS
  sock.ev.on('connection.update', (update) => {
    const { connection, pairingCode, lastDisconnect } = update;

    if (pairingCode) {
      console.log('\n=====================================');
      console.log('📱 CÓDIGO DE VINCULACIÓN: ' + pairingCode);
      console.log('=====================================');
      console.log('Pasos: WhatsApp > Ajustes > Dispositivos vinculados > ¿Vincular con número?');
    }

    if (connection === 'open') {
      console.log('✅ BOT CONECTADO CORRECTAMENTE 24/7');
    }

    if (connection === 'close') {
      const reconectar = lastDisconnect?.error instanceof Boom &&
        lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
      if (reconectar) iniciarBot();
    }
  });

  // 📩 MANEJO DE MENSAJES Y COMANDOS
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg || msg.key.fromMe || !msg.message) return;

    const remitente = msg.key.remoteJid;
    const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    if (!texto.startsWith(PREFIJO)) return;

    const partes = texto.slice(PREFIJO.length).trim().split(' ');
    const comando = partes.shift().toLowerCase();
    const argumentos = partes.join(' ');

    // ======================
    // 📊 SISTEMA DE ECONOMÍA
    // ======================
    if (comando === 'registrar') {
      if (!db.has(remitente)) {
        db.set(remitente, { monedas: 120, nivel: 1, xp: 0, inventario: [] });
        return sock.sendMessage(remitente, { text: '✅ Te has registrado exitosamente!\nRecibiste 120 monedas de bienvenida.' });
      }
      return sock.sendMessage(remitente, { text: '⚠️ Ya tienes una cuenta creada.' });
    }

    if (comando === 'perfil') {
      const usuario = db.get(remitente);
      if (!usuario) return sock.sendMessage(remitente, { text: '❌ Usa primero el comando !registrar' });
      return sock.sendMessage(remitente, { text: `📊 TU PERFIL\n👤 Usuario: @${remitente.split('@')[0]}\n💰 Monedas: ${usuario.monedas}\n⭐ Nivel: ${usuario.nivel}\n✨ Experiencia: ${usuario.xp}/150` }, { mentions: [remitente] });
    }

    if (comando === 'trabajar') {
      const usuario = db.get(remitente);
      if (!usuario) return sock.sendMessage(remitente, { text: '❌ Usa primero el comando !registrar' });

      const ganancia = Math.floor(Math.random() * 60) + 25;
      usuario.monedas += ganancia;
      usuario.xp += 15;

      if (usuario.xp >= 150) {
        usuario.nivel += 1;
        usuario.xp = 0;
        usuario.monedas += 150;
        await sock.sendMessage(remitente, { text: `🎉 ¡Felicidades! Subiste al nivel ${usuario.nivel}\nRecibiste 150 monedas extra de recompensa` });
      }

      db.set(remitente, usuario);
      return sock.sendMessage(remitente, { text: `💼 Trabajaste duro y ganaste ${ganancia} monedas\n💰 Saldo actual: ${usuario.monedas}` });
    }

    // ======================
    // 🎁 SISTEMA GACHA
    // ======================
    if (comando === 'gacha') {
      const usuario = db.get(remitente);
      if (!usuario) return sock.sendMessage(remitente, { text: '❌ Usa primero el comando !registrar' });
      if (usuario.monedas < 90) return sock.sendMessage(remitente, { text: '❌ Necesitas al menos 90 monedas para jugar' });

      usuario.monedas -= 90;

      const premios = [
        { nombre: 'Espada de Madera', rareza: 'Común', probabilidad: 50 },
        { nombre: 'Poción de Vida', rareza: 'Poco Común', probabilidad: 28 },
        { nombre: 'Espada de Hierro', rareza: 'Rara', probabilidad: 15 },
        { nombre: 'Amuleto Dorado', rareza: 'Épica', probabilidad: 6 },
        { nombre: 'Espada Legendaria', rareza: 'Legendaria', probabilidad: 1 }
      ];

      let aleatorio = Math.random() * 100;
      let premioGanado;
      let acumulado = 0;

      for (const item of premios) {
        acumulado += item.probabilidad;
        if (aleatorio <= acumulado) {
          premioGanado = item;
          break;
        }
      }

      usuario.inventario.push(premioGanado.nombre);
      db.set(remitente, usuario);

      return sock.sendMessage(remitente, {
        text: `🎁 GACHA\n✨ ¡Obtuviste un objeto!\n📦 ${premioGanado.nombre}\n⭐ Rareza: ${premioGanado.rareza}\n\n💰 Saldo restante: ${usuario.monedas}`
      });
    }

    if (comando === 'inventario') {
      const usuario = db.get(remitente);
      if (!usuario) return sock.sendMessage(remitente, { text: '❌ Usa primero el comando !registrar' });
      if (usuario.inventario.length === 0) return sock.sendMessage(remitente, { text: '📦 Tu inventario está vacío. Prueba jugar !gacha' });
      return sock.sendMessage(remitente, { text: `📦 TUS OBJETOS:\n${usuario.inventario.join('\n')}` });
    }

    // ======================
    // ⚙️ ADMINISTRACIÓN (SOLO TÚ)
    // ======================
    if (comando === 'agregar' && remitente.startsWith(OWNER)) {
      const cantidad = parseInt(argumentos);
      if (isNaN(cantidad)) return sock.sendMessage(remitente, { text: '❌ Formato incorrecto. Ejemplo: !agregar 500' });

      const usuario = db.get(remitente) || { monedas: 0, nivel: 1, xp: 0, inventario: [] };
      usuario.monedas += cantidad;
      db.set(remitente, usuario);

      return sock.sendMessage(remitente, { text: `✅ Agregaste ${cantidad} monedas correctamente\n💰 Saldo actual: ${usuario.monedas}` });
    }

    // ======================
    // 📖 AYUDA
    // ======================
    if (comando === 'ayuda') {
      return sock.sendMessage(remitente, {
        text: `🤖 BOT MULTIFUNCIÓN\n\n📊 *ECONOMÍA*\n!registrar - Crear tu cuenta\n!perfil - Ver tus datos\n!trabajar - Ganar monedas\n\n🎁 *GACHA*\n!gacha - Girar por premios (90 monedas)\n!inventario - Ver tus objetos\n\n⚙️ *ADMIN*\n!agregar [cantidad] - Agregar monedas (solo dueño)`
      });
    }
  });
}

iniciarBot();
      
