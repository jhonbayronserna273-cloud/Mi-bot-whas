const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const NodeCache = require('node-cache');
const { Boom } = require('@hapi/boom');

// Almacenamiento temporal
const db = new NodeCache({ stdTTL: 0 });
const OWNER_NUMERO = '573000000000'; // ⚠️ CAMBIA ESTE NÚMERO POR EL TUYO CON CÓDIGO DE PAÍS

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('sesion');
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: require('pino')({ level: 'silent' }),
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;
    
    if (qr) {
      console.log('=== CÓDIGO DE VINCULACIÓN ===');
      qrcode.generate(qr, { small: true });
      console.log('Escanea el código desde WhatsApp > Dispositivos vinculados');
    }

    if (connection === 'open') {
      console.log('✅ BOT CONECTADO Y FUNCIONANDO 24/7');
    }

    if (connection === 'close') {
      const reconectar = lastDisconnect?.error instanceof Boom && 
        lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
      
      if (reconectar) iniciarBot();
    }
  });

  // MANEJO DE MENSAJES
  sock.ev.on('messages.upsert', async (m) => {
    const mensaje = m.messages[0];
    if (!mensaje.key.fromMe && mensaje.message) {
      const remitente = mensaje.key.remoteJid;
      const texto = mensaje.message.conversation || mensaje.message.extendedTextMessage?.text || '';
      const prefijo = '!';

      if (!texto.startsWith(prefijo)) return;

      const comando = texto.slice(prefijo.length).trim().split(' ')[0].toLowerCase();
      const argumentos = texto.slice(prefijo.length + comando.length).trim();

      // === SISTEMA DE ECONOMÍA ===
      if (comando === 'registrar') {
        if (!db.has(remitente)) {
          db.set(remitente, { monedas: 100, nivel: 1, xp: 0, inventario: [] });
          await sock.sendMessage(remitente, { text: '✅ Te has registrado exitosamente! Recibiste 100 monedas.' });
        } else {
          await sock.sendMessage(remitente, { text: '⚠️ Ya estás registrado.' });
        }
      }

      if (comando === 'perfil') {
        const usuario = db.get(remitente);
        if (!usuario) return sock.sendMessage(remitente, { text: '❌ Usa !registrar primero' });
        await sock.sendMessage(remitente, { 
          text: `📊 PERFIL\n👤 Usuario: @${remitente.split('@')[0]}\n💰 Monedas: ${usuario.monedas}\n⭐ Nivel: ${usuario.nivel}\n✨ XP: ${usuario.xp}/100` 
        }, { mentions: [remitente] });
      }

      if (comando === 'trabajar') {
        const usuario = db.get(remitente);
        if (!usuario) return sock.sendMessage(remitente, { text: '❌ Usa !registrar primero' });
        const ganancia = Math.floor(Math.random() * 50) + 20;
        usuario.monedas += ganancia;
        usuario.xp += 10;
        if (usuario.xp >= 100) {
          usuario.nivel += 1;
          usuario.xp = 0;
          usuario.monedas += 100;
          await sock.sendMessage(remitente, { text: `🎉 ¡Subiste al nivel ${usuario.nivel}! Ganaste 100 monedas extra` });
        }
        db.set(remitente, usuario);
        await sock.sendMessage(remitente, { text: `💼 Trabajaste y ganaste ${ganancia} monedas\n💰 Total: ${usuario.monedas}` });
      }

      // === SISTEMA GACHA ===
      if (comando === 'gacha') {
        const usuario = db.get(remitente);
        if (!usuario) return sock.sendMessage(remitente, { text: '❌ Usa !registrar primero' });
        if (usuario.monedas < 80) return sock.sendMessage(remitente, { text: '❌ Necesitas al menos 80 monedas' });
        
        usuario.monedas -= 80;
        const premios = [
          { nombre: 'Espada de Madera', rareza: 'Común', probabilidad: 50 },
          { nombre: 'Poción de Vida', rareza: 'Poco Común', probabilidad: 30 },
          { nombre: 'Espada de Hierro', rareza: 'Rara', probabilidad: 15 },
          { nombre: 'Amuleto Dorado', rareza: 'Épica', probabilidad: 4 },
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
        
        await sock.sendMessage(remitente, { 
          text: `🎁 GACHA\n\n✨ ¡Obtuviste!\n📦 ${premioGanado.nombre}\n⭐ Rareza: ${premioGanado.rareza}\n\n💰 Saldo restante: ${usuario.monedas}` 
        });
      }

      if (comando === 'inventario') {
        const usuario = db.get(remitente);
        if (!usuario) return sock.sendMessage(remitente, { text: '❌ Usa !registrar primero' });
        if (usuario.inventario.length === 0) return sock.sendMessage(remitente, { text: '📦 Tu inventario está vacío' });
        await sock.sendMessage(remitente, { text: `📦 INVENTARIO:\n${usuario.inventario.join('\n')}` });
      }

      // === UTILIDADES ===
      if (comando === 'ayuda') {
        await sock.sendMessage(remitente, { 
          text: `🤖 BOT MULTIFUNCIÓN\n\n📝 *ECONOMÍA*\n!registrar - Crear cuenta\n!perfil - Ver tu perfil\n!trabajar - Ganar monedas\n\n🎁 *GACHA*\n!gacha - Girar (80 monedas)\n!inventario - Ver objetos\n\n⚙️ *OTROS*\n!ayuda - Ver este menú\n!info - Información del bot` 
        });
      }

      if (comando === 'info') {
        await sock.sendMessage(remitente, { text: `ℹ️ BOT WHATSAPP\nVersión: 1.0\nFunciona 24/7\nCreado para GitHub + Render` });
      }

      // === ADMINISTRACIÓN (SOLO OWNER) ===
      if (comando === 'agregar' && remitente.includes(OWNER_NUMERO)) {
        const monto = parseInt(argumentos);
        if (isNaN(monto)) return sock.sendMessage(remitente, { text: '❌ Escribe la cantidad: !agregar 100' });
        const usuario = db.get(remitente) || { monedas: 0, nivel: 1, xp: 0, inventario: [] };
        usuario.monedas += monto;
        db.set(remitente, usuario);
        await sock.sendMessage(remitente, { text: `✅ Agregaste ${monto} monedas` });
      }
    }
  });
}

iniciarBot();
                             
