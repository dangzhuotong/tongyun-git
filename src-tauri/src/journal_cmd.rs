//! Desktop commands share one audit actor. Metadata only; bodies stay in the handler.

pub fn run<T>(
    action: &str,
    target: &str,
    body: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    tg_core::journal::run(action, target, "desktop:local", "desktop-session", body)
}

pub async fn run_async<T>(
    action: &str,
    target: &str,
    body: impl std::future::Future<Output = Result<T, String>>,
) -> Result<T, String> {
    tg_core::journal::run_async(action, target, "desktop:local", "desktop-session", body).await
}
