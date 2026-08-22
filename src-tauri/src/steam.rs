/* Steamworks Session Ticket (doc 23 / 25)
   Valve 公式: GetAuthTicketForWebApi → AuthenticateUserTicket。
   コールバックは Init したスレッドで RunCallbacks する。 */

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::thread;
use std::time::{Duration, Instant};

use steamworks::{Client, TicketForWebApiResponse};

/// Steamworks App ID。ストア / Workers `STEAM_APP_ID` と同じ。
pub const APP_ID: u32 = 5138130;
/// AuthenticateUserTicket の identity と一致させる（server/src/lib/steam.ts STEAM_WEB_API_IDENTITY）
const WEB_IDENTITY: &str = "hyakkiban";
const TICKET_TIMEOUT: Duration = Duration::from_secs(8);

enum SteamReq {
    SessionTicket(Sender<Result<String, String>>),
}

#[derive(Clone)]
pub struct SteamHandle {
    tx: Sender<SteamReq>,
}

impl SteamHandle {
    pub fn spawn() -> Self {
        let (tx, rx) = mpsc::channel();
        thread::Builder::new()
            .name("steamworks".into())
            .spawn(move || steam_worker(rx))
            .expect("failed to spawn steamworks thread");
        Self { tx }
    }

    pub fn session_ticket(&self) -> Result<String, String> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.tx
            .send(SteamReq::SessionTicket(reply_tx))
            .map_err(|_| "Steamworks スレッドが停止しています".to_string())?;
        reply_rx
            .recv_timeout(TICKET_TIMEOUT + Duration::from_secs(2))
            .map_err(|_| "Steam チケットの取得がタイムアウトしました".to_string())?
    }
}

fn steam_worker(rx: Receiver<SteamReq>) {
    let mut client: Option<Client> = None;
    loop {
        match rx.recv_timeout(Duration::from_millis(16)) {
            Ok(SteamReq::SessionTicket(reply)) => {
                if client.is_none() {
                    match Client::init_app(APP_ID) {
                        Ok(c) => client = Some(c),
                        Err(e) => {
                            let _ = reply.send(Err(format!(
                                "Steamworks を初期化できません（Steam クライアント起動と App {APP_ID} の所有が必要です）: {e}"
                            )));
                            continue;
                        }
                    }
                }
                let Some(c) = client.as_ref() else { continue };
                let _ = reply.send(fetch_web_ticket(c));
            }
            Err(RecvTimeoutError::Timeout) => {
                if let Some(c) = client.as_ref() {
                    c.run_callbacks();
                }
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}

fn fetch_web_ticket(client: &Client) -> Result<String, String> {
    let (tx, rx) = mpsc::channel();
    let _cb = client.register_callback(move |resp: TicketForWebApiResponse| {
        let _ = tx.send(resp);
    });
    let _handle = client
        .user()
        .authentication_session_ticket_for_webapi(WEB_IDENTITY);

    let deadline = Instant::now() + TICKET_TIMEOUT;
    loop {
        client.run_callbacks();
        match rx.try_recv() {
            Ok(resp) => return ticket_to_hex(resp),
            Err(TryRecvError::Empty) => {
                if Instant::now() >= deadline {
                    return Err("Steam チケットの取得がタイムアウトしました".into());
                }
                thread::sleep(Duration::from_millis(16));
            }
            Err(TryRecvError::Disconnected) => {
                return Err("Steam コールバックが切断されました".into());
            }
        }
    }
}

fn ticket_to_hex(resp: TicketForWebApiResponse) -> Result<String, String> {
    resp.result
        .map_err(|e| format!("Steam チケットを発行できません: {e}"))?;
    if resp.ticket_len <= 0 {
        return Err("Steam チケットが空です".into());
    }
    let n = (resp.ticket_len as usize).min(resp.ticket.len());
    Ok(to_hex(&resp.ticket[..n]))
}

fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

#[cfg(test)]
mod live {
    use super::*;

    #[test]
    #[ignore = "requires running Steam client and App 5138130"]
    fn fetch_web_ticket_live() {
        let handle = SteamHandle::spawn();
        let ticket = handle.session_ticket().expect("Steam session ticket");
        assert!(!ticket.is_empty(), "empty ticket");
        assert!(ticket.len() >= 32, "ticket too short");
        assert!(
            ticket.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f')),
            "ticket must be lowercase hex"
        );
        eprintln!("steam ticket ok, hex_len={}", ticket.len());
    }
}

