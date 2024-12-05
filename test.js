import styled from 'styled-components';
import React from 'react';
import moment from 'moment';
import lodash from 'lodash';
const axios = require('axios');
const testImport = require('./src/exemple/exemple');

testImport();

const apiCall = axios.get('https://api.github.com/users/rs-4');
