const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const NodeCache = require('node-cache');

// Base de datos simple
const db = new NodeCache({ stdTTL: 0 });
const OWNER = '573000000000'; // ⚠️ Pon TU número con código de país (ej: 573041234567)
const PREFIJO = '!';

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('sesion');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        syncFullHistory: false,
        logger: require('pino')({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    // 🔑 AQUÍ SALE EL CÓDIGO DE 8 DÍGITOS
    sock.ev.on('connection.update', (update) => {
        const { connection, pairingCode, lastDisconnect } = update;

        if (pairingCode) {
            console.log('\n=====================================');
            console.log('📱 CÓDIGO DE VINCULACIÓN: ' + pairingCode);
            console.log('=====================================');
            console.log('Ve a WhatsApp > Ajustes > Dispositivos vinculados > ¿Vincular con número?');
        }

        if (connection === 'open') {
            console.log('✅ BOT CONECTADO CORRECTAMENTE');
        }

        if (connection === 'close') {
            const reconectar = lastDisconnect?.error instanceof Boom &&
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
            if (reconectar) iniciarBot();
        }
    });

    // 📩 RECIBIR MENSAJES
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.key.fromMe && msg.message) {
            const remitente = msg.key.remoteJid;
            const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

            if (!texto.startsWith(PREFIJO)) return;

            const partes = texto.slice(PREFIJO.length).trim().split(' ');
            const comando = partes.shift().toLowerCase();
            const argumentos = partes.join(' ');

            // ======================
            // 📊 ECONOMÍA
            // ======================
            if (comando === 'registrar') {
                if (!db.has(remitente)) {
                    db.set(remitente, { monedas: 120, nivel: 1, xp: 0, inventario: [] });
                    return sock.sendMessage(remitente, { text: '✅ Te has registrado! Recibiste 120 monedas.' });
                }
                return sock.sendMessage(remitente, { text: '⚠️ Ya estás registrado.' });
            }

            if (comando === 'perfil') {
                const user = db.get(remitente);
                if (!user) return sock.sendMessage(remitente, { text: '❌ Usa !registrar primero' });
                return sock.sendMessage(remitente, { text: `📊 PERFIL\n👤 Usuario\n💰 Monedas: ${user.monedas}\n⭐ Nivel: ${user.nivel}\n✨ XP: ${user.xp}/150` });
            }

            if (comando === 'trabajar') {
                const user = db.get(remitente);
                if (!user) return sock.sendMessage(remitente, { text: '❌ Usa !registrar primero' });
                const gana = Math.floor(Math.random() * 60) + 25;
                user.monedas += gana;
                user.xp += 15;
                if (user.xp >= 150) {
                    user.nivel += 1;
                    user.xp = 0;
                    user.monedas += 150;
                    await sock.sendMessage(remitente, { text: `🎉 Subiste al nivel ${user.nivel}! +150 monedas extra` });
                }
                db.set(remitente, user);
                return sock.sendMessage(remitente, { text: `💼 Trabajaste y ganaste ${gana} monedas\n💰 Saldo: ${user.monedas}` });
            }

            // ======================
            // 🎁 GACHA
            // ======================
            if (comando === 'gacha') {
                const user = db.get(remitente);
                if (!user) return sock.sendMessage(remitente, { text: '❌ Usa !registrar primero' });
                if (user.monedas < 90) return sock.sendMessage(remitente, { text: '❌ Necesitas 90 monedas' });

                user.monedas -= 90;
                const premios = [
                    { nom: 'Espada de Madera', rare: 'Común', prob: 50 },
                    { nom: 'Poción de Vida', rare: 'Poco Común', prob: 28 },
                    { nom: 'Espada de Hierro', rare: 'Rara', prob: 15 },
                    { nom: 'Amuleto Dorado', rare: 'Épica', prob: 6 },
                    { nom: 'Espada Legendaria', rare: 'Legendaria', prob: 1 }
                ];

                let azar = Math.random() * 100;
                let ganado;
                let suma = 0;
                for (let p of premios) {
                    suma += p.prob;
                    if (azar <= suma) { ganado = p; break; }
                }

                user.inventario.push(ganado.nom);
                db.set(remitente, user);
                return sock.sendMessage(remitente, { text: `🎁 GACHA\n✨ Obtuviste:\n📦 ${ganado.nom}\n⭐ Rareza: ${ganado.rare}\n💰 Restante: ${user.monedas}` });
            }

            if (comando === 'inventario') {
                const user = db.get(remitente);
                if (!user) return sock.sendMessage(remitente, { text: '❌ Usa !registrar primero' });
                if (user.inventario.length === 0) return sock.sendMessage(remitente, { text: '📦 Inventario vacío' });
                return sock.sendMessage(remitente, { text: `📦 TUS OBJETOS:\n${user.inventario.join('\n')}` });
            }

            // ======================
            // ⚙️ ADMIN Y UTILIDADES
            // ======================
            if (comando === 'agregar' && remitente.startsWith(OWNER)) {
                const cant = parseInt(argumentos);
                if (isNaN(cant)) return sock.sendMessage(remitente, { text: '❌ Ejemplo: !agregar 500' });
                const user = db.get(remitente) || { monedas: 0, nivel: 1, xp: 0, inventario: [] };
                user.monedas += cant;
                db.set(remitente, user);
                return sock.sendMessage(remitente, { text: `✅ Agregadas ${cant} monedas` });
            }

            if (comando === 'ayuda') {
                return sock.sendMessage(remitente, { text: `🤖 COMANDOS\n\n📊 *ECONOMÍA*\n!registrar - Crear cuenta\n!perfil - Ver datos\n!trabajar - Ganar monedas\n\n🎁 *GACHA*\n!gacha - Girar (90 monedas)\n!inventario - Ver objetos\n\n⚙️ *OTROS*\n!ayuda - Ver menú` });
            }
        }
    });
}

iniciarBot();
                                                                    
