from dify_plugin import DifyPluginEnv, Plugin

# Generation runs several minutes on the provider side; the blocking
# generate_music tool polls until the task settles, so the plugin's own
# request timeout has to outlast it.
plugin = Plugin(DifyPluginEnv(MAX_REQUEST_TIMEOUT=600))

if __name__ == "__main__":
    plugin.run()
