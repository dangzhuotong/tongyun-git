//! Job object used so a timed-out `git` takes hook-spawned children with it.
//!
//! The process is assigned immediately after `spawn`. `std::process::Command` cannot
//! hand back a suspended primary thread, so there is a short window before the job
//! exists; git does not launch hooks in that window. Closing the job does not kill
//! survivors (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` is left off) so a successful
//! command still matches Unix, where only the timeout path signals the group.

use std::ffi::c_void;
use std::os::windows::io::{AsRawHandle, RawHandle};
use std::process::Child;

extern "system" {
    fn CreateJobObjectW(attrs: *const c_void, name: *const u16) -> RawHandle;
    fn AssignProcessToJobObject(job: RawHandle, process: RawHandle) -> i32;
    fn TerminateJobObject(job: RawHandle, exit_code: u32) -> i32;
    fn CloseHandle(handle: RawHandle) -> i32;
}

pub struct Job {
    handle: RawHandle,
}

impl Job {
    pub fn attach(child: &Child) -> Option<Self> {
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return None;
            }
            if AssignProcessToJobObject(job, child.as_raw_handle()) == 0 {
                CloseHandle(job);
                return None;
            }
            Some(Self { handle: job })
        }
    }

    pub fn terminate(&self) {
        unsafe {
            TerminateJobObject(self.handle, 1);
        }
    }
}

impl Drop for Job {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.handle);
        }
    }
}
