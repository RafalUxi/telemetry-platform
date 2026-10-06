'use client';

import { useEffect, useRef, useState } from 'react';
import { SiYoutube } from 'react-icons/si';
import { FiGithub, FiLinkedin } from 'react-icons/fi';
import {
  fetchDevices,
  fetchLogin,
  fetchRegister,
  fetchSeries,
  fetchCreateDevice,
  fetchDeleteDevice,
} from '@/lib/api';
import Graph from '@/components/graphs';

type uplotChart = {
  t: string;
  tempAvg: number;
  tempMin: number;
  tempMax: number;
  humAvg: number;
  humMin: number;
  humMax: number;
};

const RANGE = [
  { time: '15 min', sec: 900 },
  { time: '1 h', sec: 3600 },
  { time: '6 h', sec: 21600 },
  { time: '24 h', sec: 86400 },
];

const takeTime = (sec: number) => {
  const now = Date.now();
  return {
    from: new Date(now - sec * 1000).toISOString(),
    to: new Date(now).toISOString(),
  };
};

export default function Panel() {
  const [log, setLog] = useState<boolean>(true);
  const [logged, setLogged] = useState<boolean>(false);
  const [log_email, setLog_email] = useState<string>('');
  const [log_pass, setLog_pass] = useState<string>('');
  const [reg_email, setReg_email] = useState<string>('');
  const [reg_pass, setReg_pass] = useState<string>('');
  const [alert, setAlert] = useState<string | null>(null);
  const [guest, setGuest] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [created, setCreated] = useState<{ deviceId: string; password: string } | null>();
  const [selectDevice, setSelectDevice] = useState<{
    id: string;
    devices: string;
    name: string;
  } | null>(null);
  const [devices, setDevices] = useState<{ id: string; devices: string; name: string }[]>([]);
  const [chartTemp, setChartTemp] = useState<uPlot.AlignedData>([]);
  const [chartHum, setChartHum] = useState<uPlot.AlignedData>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useRef(false);

  const showAlert = (text: string) => {
    if (timer.current !== null) clearTimeout(timer.current);
    setAlert(text);
    timer.current = setTimeout(() => setAlert(null), 5000);
  };

  const plot = async (sec: number) => {
    if (selectDevice === null) {
      showAlert('Select device');
      return;
    }
    const { from, to } = takeTime(sec);
    const points = 800;

    const series = await fetchSeries(selectDevice.id, from, to, points);

    if (series.ok) {
      const pointsChart: uplotChart[] = series.body ?? [];

      const x = pointsChart.map((p) => new Date(p.t).getTime() / 1000);
      const tempY = pointsChart.map((p) => p.tempAvg);
      const humY = pointsChart.map((p) => p.humAvg);

      setChartTemp([x, tempY] as uPlot.AlignedData);
      setChartHum([x, humY] as uPlot.AlignedData);
    } else if (series.status === 401) {
      setLogged(false);
      showAlert('Your session has expired - please log in again');
    } else {
      showAlert('Something went wrong with create plot');
    }
  };

  const readDevices = async () => {
    const devices = await fetchDevices();
    if (stop.current) return;
    if (devices.ok) {
      setDevices(devices.body);
    } else if (devices.status === 401) {
      setLogged(false);
      showAlert('Your session has expired - please log in again');
    } else {
      showAlert('Something went wrong with read list of devices');
    }
  };

  useEffect(() => {
    stop.current = false;
    if (logged) {
      // readDevices awaits the request before it touches state, so the update is
      // not synchronous - the rule cannot see through the await.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      readDevices();
    }
    return () => {
      stop.current = true;
    };
  }, [logged]);

  const guestLogin = async () => {
    const email = process.env.NEXT_PUBLIC_DEMO_EMAIL;
    const password = process.env.NEXT_PUBLIC_DEMO_PASSWORD;
    if (!email || !password) {
      showAlert('Login as a guest went wrong');
      return;
    }
    const guestLogin = await fetchLogin({ email, password });
    if (guestLogin.status === 200) {
      setLogged(true);
      setGuest(true);
    } else {
      showAlert('Login as a guest went wrong');
    }
  };

  const login = async (email: string, password: string) => {
    let textAlert: string;
    const data = {
      email: email,
      password: password,
    };

    const userLogin = await fetchLogin(data);

    if (userLogin.status === 200) {
      setLogged(true);
      setGuest(false);
    } else if (userLogin.status === 401) {
      textAlert = 'wrong email or password';
      showAlert(textAlert);
    } else {
      textAlert = `Login failed ${userLogin.status}`;
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

  const newDevice = async (name: string) => {
    if (name.length === 0) return;

    const dev = await fetchCreateDevice(name);

    if (dev.ok) {
      showAlert('Successful created new device');
      setCreated({ deviceId: dev.body.deviceId, password: dev.body.password });
      readDevices();
    } else if (dev.status === 401) {
      setLogged(false);
      showAlert('Your session has expired - please log in again');
    } else {
      showAlert('Something went wrong with create new device');
    }
  };

  const deleteDevice = async (id: string) => {
    const dev = await fetchDeleteDevice(id);

    if (dev.ok) {
      showAlert('Successful deleted device');
      setSelectDevice(null);
      readDevices();
    } else if (dev.status === 401) {
      setLogged(false);
      showAlert('Your session has expired - please log in again');
    } else {
      showAlert('Something went wrong with delete device');
    }
  };

  if (!logged) {
    if (log) {
      return (
        <div className="relative w-full flex justify-center items-center h-screen bg-black z-0">
          <div className="absolute bottom-0 right-0 text-md">Built by Rafał Trzeciakowski</div>
          <div className="bg-zinc-950 border space-y-2 flex flex-col relative items-center justify-center border-zinc-600 w-2/7 h-4/6 rounded-2xl">
            <div className="space-x-2 absolute top-1/6 flex flex-row border-2 border-zinc-600 rounded-4xl">
              <button
                onClick={() => setLog(true)}
                className=" text-xl  font-bold rounded-4xl bg-zinc-800 px-6 py-2"
              >
                Log in
              </button>
              <button
                onClick={() => setLog(false)}
                className=" text-xl font-bold hover:bg-zinc-900 rounded-4xl px-4 py-2"
              >
                Sign in
              </button>
              <button
                onClick={() => {
                  guestLogin();
                }}
                className=" text-xl font-bold hover:bg-zinc-900 rounded-4xl px-4 py-2"
              >
                Guest
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
          <div className="absolute bottom-0 right-0 text-md">Built by Rafał Trzeciakowski</div>
          <div className="bg-zinc-950 border space-y-2 flex flex-col relative items-center justify-center border-zinc-600 w-2/7 h-4/6 rounded-2xl">
            <div className="space-x-2 absolute top-1/6 flex flex-row border-2 border-zinc-600 rounded-4xl">
              <button
                onClick={() => setLog(true)}
                className=" text-xl hover:bg-zinc-900 font-bold rounded-4xl px-6 py-2"
              >
                Log in
              </button>
              <button
                onClick={() => setLog(false)}
                className=" text-xl font-bold rounded-4xl bg-zinc-800  px-4 py-2"
              >
                Sign in
              </button>
              <button
                onClick={() => {
                  guestLogin();
                }}
                className=" text-xl font-bold hover:bg-zinc-900 rounded-4xl px-4 py-2"
              >
                Guest
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

  if (logged) {
    return (
      <div className="relative w-full h-screen bg-black z-0">
        {alert !== null && (
          <div className="text-violet-600 text-xl font-bold absolute bottom-0 w-screen flex justify-center">
            {alert}
          </div>
        )}
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
                    onClick={() => plot(r.sec)}
                    className="cursor-pointer border border-zinc-600 bg-zinc-950 rounded-2xl justify-center items-center flex h-8 hover:bg-zinc-900 w-24"
                  >
                    {r.time}
                  </div>
                );
              })}
            </div>
            <Graph data={chartTemp} label="temperatura" stroke="#a78bfa" />
          </div>
          <div className="relative w-3/5 h-2/5 border border-zinc-600 bg-zinc-950 rounded-3xl">
            <div className="font-bold text-md ml-4 mt-2">Humidity monitoring</div>
            <div className="absolute right-0 top-0 mt-2 mr-4 flex flex-row space-x-4">
              {RANGE.map((r, i) => {
                return (
                  <div
                    key={i}
                    onClick={() => plot(r.sec)}
                    className="cursor-pointer border border-zinc-600 bg-zinc-950 rounded-2xl justify-center items-center flex h-8 hover:bg-zinc-900 w-24"
                  >
                    {r.time}
                  </div>
                );
              })}
            </div>
            <Graph data={chartHum} label="temperatura" stroke="#a78bfa" />
          </div>

          <div className="border border-zinc-600 bg-zinc-950 min-h-1/5 absolute min-w-1/7 rounded-3xl right-1/35">
            <div className="flex flex-col items-center mt-4">
              <h1 className="text-md font-bold">List of your devices</h1>
              {devices.length !== 0 ? (
                <div className="mt-2 max-h-80 overflow-y-auto mb-4 text-sm flex flex-col items-center w-9/10 h-full">
                  {devices.map((d, i) => {
                    if (selectDevice === null) {
                      return (
                        <div key={i} className="flex">
                          <div
                            onClick={() => setSelectDevice(d)}
                            className="hover:text-violet-600 cursor-pointer "
                          >
                            {d.name}
                          </div>
                          {guest === false && (
                            <div
                              onClick={() => deleteDevice(d.id)}
                              className="border hover:bg-zinc-600 absolute right-1/6 cursor-pointer rounded-full w-5 h-5 flex justify-center items-center"
                            >
                              x
                            </div>
                          )}
                        </div>
                      );
                    }
                    if (selectDevice.id === d.id) {
                      return (
                        <div key={i} className="flex">
                          <div
                            onClick={() => setSelectDevice(d)}
                            className="hover:text-violet-600 cursor-pointer text-violet-400"
                          >
                            {d.name}
                          </div>
                          {guest === false && (
                            <div
                              onClick={() => deleteDevice(d.id)}
                              className="border hover:bg-zinc-600 absolute right-1/6 cursor-pointer rounded-full w-5 h-5 flex justify-center items-center"
                            >
                              x
                            </div>
                          )}
                        </div>
                      );
                    } else {
                      return (
                        <div key={i} className="flex">
                          <div
                            onClick={() => setSelectDevice(d)}
                            className="hover:text-violet-600 cursor-pointer "
                          >
                            {d.name}
                          </div>
                          {guest === false && (
                            <div
                              onClick={() => deleteDevice(d.id)}
                              className="border hover:bg-zinc-600 absolute right-1/6 cursor-pointer rounded-full w-5 h-5 flex justify-center items-center"
                            >
                              x
                            </div>
                          )}
                        </div>
                      );
                    }
                  })}
                </div>
              ) : (
                <div className=" text-violet-600 absolute top-2/5 ">
                  You currently have no devices
                </div>
              )}
            </div>
          </div>
          {guest === false && (
            <div className="border border-zinc-600 bg-zinc-950 h-1/5 absolute w-1/7 rounded-3xl left-1/35">
              <div className="flex flex-col items-center mt-4 space-y-4">
                <h1 className="text-md font-bold">Add new device</h1>
                <input
                  className="px-2 py-1 outline-none border rounded-2xl bg-zinc-950"
                  type="text"
                  placeholder="device name"
                  value={newName}
                  maxLength={32}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <button
                  onClick={() => {
                    newDevice(newName);
                    setNewName('');
                  }}
                  disabled={newName.length === 0}
                  className="text-white px-4 disabled:bg-black enabled:hover:text-violet-600 rounded-2xl py-1 cursor-pointer border disabled:cursor-default"
                >
                  Add
                </button>
              </div>
            </div>
          )}
          {created && (
            <div className="absolute rounded-2xl border border-white flex  h-64 w-lg bg-zinc-900 z-50">
              <div className="w-full h-full relative flex flex-col text-sm justify-center items-center text-white">
                <div
                  onClick={() => setCreated(null)}
                  className="absolute top-1/25 right-1/50 cursor-pointer hover:bg-violet-900 border rounded-2xl h-6 w-6 flex justify-center"
                >
                  x
                </div>
                <div className=" font-bold">
                  Connection instructions (data shown once, save for later)
                </div>
                <div>Device ID: {created.deviceId}</div>
                <div>Username: {created.deviceId}</div>
                <div>Client ID: {created.deviceId}</div>
                <div>Password: {created.password}</div>
                <div>Broker: {process.env.NEXT_PUBLIC_MQTT_URL}</div>
                <div>Topic: devices/{created.deviceId}/telemetry</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
}
