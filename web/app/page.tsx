'use client';

import { useRef, useState } from 'react';
import { SiYoutube } from 'react-icons/si';
import { FiGithub, FiLinkedin } from 'react-icons/fi';
import { fetchLogin, fetchRegister } from '@/lib/api';

const RANGE = [
  { time: '15 min', sec: 900 },
  { time: '1 h', sec: 3600 },
  { time: '6 h', sec: 21600 },
  { time: '24 h', sec: 86400 },
];

export default function Home() {
  const [log, setLog] = useState<boolean>(true);
  const [token, setToken] = useState<string>();
  const [log_email, setLog_email] = useState<string>('');
  const [log_pass, setLog_pass] = useState<string>('');
  const [reg_email, setReg_email] = useState<string>('');
  const [reg_pass, setReg_pass] = useState<string>('');
  const [alert, setAlert] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showAlert = (text: string) => {
    if (timer.current !== null) clearTimeout(timer.current);
    setAlert(text);
    timer.current = setTimeout(() => setAlert(null), 5000);
  };

  const plot = (time: number) => {
    console.log(time);
  };

  const login = async (email: string, password: string) => {
    let textAlert: string;
    const data = {
      email: email,
      password: password,
    };

    const userLogin = await fetchLogin(data);

    if (userLogin.status === 200) {
      setToken(userLogin.body.accessToken);
    }

    if (userLogin.status === 401) {
      textAlert = 'wrong email or password';
      showAlert(textAlert);
    }
  };

  const register = async (email: string, password: string) => {
    let textAlert: string;
    const data = {
      email: email,
      password: password,
    };

    const user = await fetchRegister(data);

    if (user.ok) {
      textAlert = 'Successful sign in. You can log in now';
      setReg_email('');
      setReg_pass('');
    } else if (user.status === 409) {
      textAlert = user.body.message;
    } else if (user.status === 400) {
      textAlert = user.body.message[0].message;
    } else {
      textAlert = `registration failed ${user.status}`;
    }

    showAlert(textAlert);
  };

  if (!token) {
    if (log) {
      return (
        <div className="relative w-full flex justify-center items-center h-screen bg-black z-0">
          <div className="bg-zinc-950 border space-y-2 flex flex-col relative items-center justify-center border-zinc-600 w-2/7 h-4/6 rounded-2xl">
            <div className="space-x-2 absolute top-1/6 flex flex-row border-2 border-zinc-600 rounded-4xl">
              <button
                onClick={() => setLog(true)}
                className=" text-xl font-bold rounded-4xl bg-zinc-800 px-6 py-2"
              >
                Log in
              </button>
              <button
                onClick={() => setLog(false)}
                className=" text-xl font-bold rounded-4xl px-4 py-2"
              >
                Sign in
              </button>
            </div>

            <div className="flex absolute top-1/3 flex-row space-x-4">
              <a
                href="https://github.com/RafalUxi"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/40 transition-colors duration-200 hover:text-purple-300"
              >
                <FiGithub className="h-8 w-8" />
              </a>
              <a
                href="https://www.linkedin.com/in/rafa%C5%82-trzeciakowski-2015b4419/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/40 transition-colors duration-200 hover:text-purple-300"
              >
                <FiLinkedin className="h-8 w-8" />
              </a>
              <a
                href="https://www.youtube.com/@Uxi_dev"
                className="text-white/40 transition-colors duration-200 hover:text-purple-300"
              >
                <SiYoutube className="h-8 w-8" />
              </a>
            </div>

            <input
              className="px-2 py-1 outline-none border-b bg-zinc-950"
              type="text"
              placeholder="email"
              value={log_email}
              onChange={(e) => setLog_email(e.target.value)}
            />
            <input
              className="px-2 py-1 outline-none border-b bg-zinc-950"
              type="text"
              placeholder="password"
              value={log_pass}
              maxLength={32}
              onChange={(e) => setLog_pass(e.target.value)}
            />
            <button
              onClick={() => login(log_email, log_pass)}
              className=" bg-violet-950 text-xl absolute hover:bg-violet-900 top-6/10 font-bold rounded-4xl w-2/5 h-10"
            >
              Let&apos;s go!
            </button>
            {alert !== null && (
              <div className="text-zinc-100 text-xl font-bold absolute top-8/11">{alert}</div>
            )}
          </div>
        </div>
      );
    }

    if (!log) {
      return (
        <div className="relative w-full flex justify-center items-center h-screen bg-black z-0">
          <div className="bg-zinc-950 border space-y-2 flex flex-col relative items-center justify-center border-zinc-600 w-2/7 h-4/6 rounded-2xl">
            <div className="space-x-2 absolute top-1/6 flex flex-row border-2 border-zinc-600 rounded-4xl">
              <button
                onClick={() => setLog(true)}
                className=" text-xl font-bold rounded-4xl px-6 py-2"
              >
                Log in
              </button>
              <button
                onClick={() => setLog(false)}
                className=" text-xl font-bold rounded-4xl bg-zinc-800  px-4 py-2"
              >
                Sign in
              </button>
            </div>

            <div className="flex absolute top-1/3 flex-row space-x-4">
              <a
                href="https://github.com/RafalUxi"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/40 transition-colors duration-200 hover:text-purple-300"
              >
                <FiGithub className="h-8 w-8" />
              </a>
              <a
                href="https://www.linkedin.com/in/rafa%C5%82-trzeciakowski-2015b4419/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/40 transition-colors duration-200 hover:text-purple-300"
              >
                <FiLinkedin className="h-8 w-8" />
              </a>
              <a
                href="https://www.youtube.com/@Uxi_dev"
                className="text-white/40 transition-colors duration-200 hover:text-purple-300"
              >
                <SiYoutube className="h-8 w-8" />
              </a>
            </div>

            <input
              className="px-2 py-1 outline-none border-b bg-zinc-950"
              type="text"
              placeholder="email"
              value={reg_email}
              onChange={(e) => setReg_email(e.target.value)}
            />
            <input
              className="px-2 py-1 outline-none border-b bg-zinc-950"
              type="text"
              placeholder="password"
              value={reg_pass}
              maxLength={32}
              onChange={(e) => setReg_pass(e.target.value)}
            />
            <button
              onClick={() => register(reg_email, reg_pass)}
              className=" bg-violet-950 text-xl hover:bg-violet-900 absolute top-6/10 font-bold rounded-4xl w-2/5 h-10"
            >
              Sign in
            </button>
            {alert !== null && (
              <div className="text-zinc-100 text-xl font-bold absolute top-8/11">{alert}</div>
            )}
          </div>
        </div>
      );
    }
  }

  if (token) {
    return (
      <div className="relative w-full h-screen bg-black z-0">
        <div className="w-full flex justify-start items-center h-16 z-10 border-b bg-zinc-950 rounded-b-md border-zinc-600 ">
          <div className=" ml-6">
            <h1 className="text-md text-white font-bold">UXI | Telemetry Platform</h1>
          </div>
        </div>
        <div className="absolute w-full flex justify-center items-center h-16 z-10 top-0 right-0">
          <div className=" ml-6">
            <h1 className="text-xl tracking-widest text-white font-bold hover:text-zinc-300 cursor-default">
              DASHBOARD
            </h1>
          </div>
        </div>

        <div className="absolute left-0 bottom-0 flex flex-col w-full items-center justify-center space-y-6 h-[97vh]">
          <div className="relative w-3/5 h-2/5 border border-zinc-600 bg-zinc-950 rounded-4xl">
            <div className="font-bold text-md ml-4 mt-2">Temperature monitoring</div>
            <div className="absolute right-0 top-0 mt-2 mr-4 flex flex-row space-x-4">
              {RANGE.map((r, i) => {
                return (
                  <div
                    key={i}
                    className="cursor-pointer border border-zinc-600 bg-zinc-950 rounded-2xl justify-center items-center flex h-8 hover:bg-zinc-900 w-24"
                  >
                    {r.time}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="relative w-3/5 h-2/5 border border-zinc-600 bg-zinc-950 rounded-3xl">
            <div className="font-bold text-md ml-4 mt-2">Humidity monitoring</div>
            <div className="absolute right-0 top-0 mt-2 mr-4 flex flex-row space-x-4">
              {RANGE.map((r, i) => {
                return (
                  <div
                    key={i}
                    onClick={() => {
                      plot(r.sec);
                    }}
                    className="cursor-pointer border border-zinc-600 bg-zinc-950 rounded-2xl justify-center items-center flex h-8 hover:bg-zinc-900 w-24"
                  >
                    {r.time}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
