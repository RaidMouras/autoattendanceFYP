import axios from 'axios';

// Create a configured instance of axios
const api = axios.create({
  baseURL: 'http://localhost:5000/api', // This points to your Node.js backend
});

export default api;