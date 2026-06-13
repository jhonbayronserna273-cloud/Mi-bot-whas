const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const NodeCache = require('node-cache');

// 🔧 Corrección para que Render no se quede esperando puerto
process.env.PORT = process.env.PORT || 3000;

// ⚙️ Configuración
const db = new NodeCache({ stdTTL: 0 });
const OWNER = '573014393977'; // ✅ Tu número ya configurado
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

    // 📱 Muestra el código de 8 dígitos
    sock.ev.on('connection.update', (update) => {
        const { connection, pairingCode, lastDisconnect } = update;

        if (pairingCode) {
            console.log('\n=====================================');
            console.log('📱 CÓDIGO DE VINCULACIÓN: ' + pairingCode);
            console.log('=====================================');
            console.log('Ve a WhatsApp > Ajustes > Dispositivos vinculados > ¿Vincular con número?');
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

    // 📩 Recibir y procesar mensajes
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
            // 📊 SISTEMA DE ECONOMÍA
            // ======================
            if (comando === 'registrar') {
                if (!db.has(remitente)) {
                    db.set(remitente, { monedas: 120, nivel: 1, xp: 0, inventario: [] });
                    return sock.sendMessage(remitente, { text: '✅ Te has registrado exitosamente! Recibiste 120 monedas.' });
                }
                return sock.sendMessage(remitente, { text: '⚠️ Ya tienes una cuenta creada.' });
            }

            if (comando === 'perfil') {
                const user = db.get(remitente);
                if (!user) return sock.sendMessage(remitente, { text: '❌ Usa primero !registrar para crear tu cuenta' });
                return sock.sendMessage(remitente, { text: `📊 TU PERFIL\n💰 Monedas: ${user.monedas}\n⭐ Nivel: ${user.nivel}\n✨ Experiencia: ${user.xp}/150` });
            }

            if (comando === 'trabajar') {
                const user = db.get(remitente);
                if (!user) return sock.sendMessage(remitente, { text: '❌ Usa primero !registrar' });
                const ganancia = Math.floor(Math.random() * 60) + 25;
                user.monedas += ganancia;
                user.xp += 15;

                if (user.xp >= 150) {
                    user.nivel += 1;
                    user.xp = 0;
                    user.monedas += 150;
                    await sock.sendMessage(remitente, { text: `🎉 ¡Subiste al nivel ${user.nivel}!\nRecibiste 150 monedas extra como recompensa` });
                }

                db.set(remitente, user);
                return sock.sendMessage(remitente, { text: `💼 Trabajaste duro y ganaste ${ganancia} monedas\n💰 Saldo actual: ${user.monedas}` });
            }

            // ======================
            // 🎁 SISTEMA GACHA
            // ======================
            if (comando === 'gacha') {
                const user = db.get(remitente);
                if (!user) return sock.sendMessage(remitente, { text: '❌ Usa primero !registrar' });
                if (user.monedas < 90) return sock.sendMessage(remitente, { text: '❌ Necesitas al menos 90 monedas para girar' });

                user.monedas -= 90;
                const premios = [
                    { nombre: 'Espada de Madera', rareza: 'Común', probabilidad: 50 },
                    { nombre: 'Poción de Vida', rareza: 'Poco Común', probabilidad: 28 },
                    { nombre: 'Espada de Hierro', rareza: 'Rara', probabilidad: 15 },
                    { nombre: 'Amuleto Dorado', rareza: 'Épica', probabilidad: 6 },
                    { nombre: 'Espada Legendaria', rareza: 'Legendaria', probabilidad: 1 }
                ];

                let aleatorio = Math.random() * 100;
                let premioObtenido;
                let acumulado = 0;

                for (const item of premios) {
                    acumulado += item.probabilidad;
                    if (aleatorio <= acumulado) {
                        premioObtenido = item;
                        break;
                    }
                }

                user.inventario.push(premioObtenido.nombre);
                db.set(remitente, user);

                return sock.sendMessage(remitente, {
                    text: `🎁 GACHA\n✨ ¡Obtuviste un objeto!\n📦 ${premioObtenido.nombre}\n⭐ Rareza: ${premioObtenido.rareza}\n\n💰 Saldo restante: ${user.monedas}`
                });
            }

            if (comando === 'inventario') {
                const user = db.get(remitente);
                if (!user) return sock.sendMessage(remitente, { text: '❌ Usa primero !registrar' });
                if (user.inventario.length === 0) return sock.sendMessage(remitente, { text: '📦 Tu inventario está vacío. Prueba girar en !gacha' });
                return sock.sendMessage(remitente, { text: `📦 TUS OBJETOS:\n${user.inventario.join('\n')}` });
            }

            // ======================
            // ⚙️ ADMINISTRACIÓN (SOLO TU)
            // ======================
            if (comando === 'agregar' && remitente.startsWith(OWNER)) {
                const cantidad = parseInt(argumentos);
                if (isNaN(cantidad)) return sock.sendMessage(remitente, { text: '❌ Formato incorrecto. Ejemplo: !agregar 500' });
                const user = db.get(remitente) || { monedas: 0, nivel: 1, xp: 0, inventario: [] };
                user.monedas += cantidad;
                db.set(remitente, user);
                return sock.sendMessage(remitente, { text: `✅ Agregaste ${cantidad} monedas correctamente\n💰 Saldo actual: ${user.monedas}` });
            }

            // ======================
            // 📖 AYUDA
            // ======================
            if (comando === 'ayuda') {
                return sock.sendMessage(remitente, {
                    text: `🤖 BOT MULTIFUNCIÓN\n\n📊 *ECONOMÍA*\n!registrar - Crear tu cuenta\n!perfil - Ver tus datos\n!trabajar - Ganar monedas\n\n🎁 *GACHA*\n!gacha - Girar por premios (90 monedas)\n!inventario - Ver tus objetos\n\n⚙️ *OTROS*\n!ayuda - Ver este menú`
                });
            }
        }
    });
}

iniciarBot();
              
