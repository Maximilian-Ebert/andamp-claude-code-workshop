import { login, logout } from './idp';
import {
  startStopwatch,
  pauseStopwatch,
  resumeStopwatch,
  stopStopwatch,
} from './time-tracking';

export const server = {
  login,
  logout,
  startStopwatch,
  pauseStopwatch,
  resumeStopwatch,
  stopStopwatch,
};
