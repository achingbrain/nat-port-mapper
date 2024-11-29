export const DEFAULT_PORT_MAPPING_TTL = 3_600_000
export const DEFAULT_AUTO_REFRESH = true
export const DEFAULT_REFRESH_TIMEOUT = 10_000
export const DEFAULT_REFRESH_THRESHOLD = 60_000
export const ONE_MINUTE = 60000
export const ONE_HOUR = ONE_MINUTE * 60
export const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/'

/**
 * @see https://upnp.org/specs/gw/UPnP-gw-WANIPv6FirewallControl-v1-Service.pdf
 */
export const DEVICE_WAN_IPV6_FIREWALL_CONTROL = 'urn:schemas-upnp-org:service:WANIPv6FirewallControl:1'

/**
 * @see https://upnp.org/specs/gw/UPnP-gw-WANIPConnection-v1-Service.pdf
 */
export const DEVICE_WAN_IP_CONNECTION_1 = 'urn:schemas-upnp-org:service:WANIPConnection:1'

/**
 * @see https://upnp.org/specs/gw/UPnP-gw-WANIPConnection-v2-Service.pdf
 */
export const DEVICE_WAN_IP_CONNECTION_2 = 'urn:schemas-upnp-org:service:WANIPConnection:2'

/**
 * @see https://upnp.org/specs/gw/UPnP-gw-InternetGatewayDevice-v1-Device.pdf
 */
export const DEVICE_INTERNET_GATEWAY_SERVICE_1 = 'urn:schemas-upnp-org:device:InternetGatewayDevice:1'

/**
 * @see https://upnp.org/specs/gw/UPnP-gw-InternetGatewayDevice-v2-Device.pdf
 */
export const DEVICE_INTERNET_GATEWAY_SERVICE_2 = 'urn:schemas-upnp-org:device:InternetGatewayDevice:2'

export const MIN_IPV6_PORT_LEASE = 3600
export const MAX_IPV6_PORT_LEAST = 86400
